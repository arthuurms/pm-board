// Turns a free-form message ("passar tarefa para o breno dia 18.10 até as 23:00 ... prioridade alta")
// into a task draft. Pure functions (no server imports) so the chat page can run it in the browser.
import { addDays, dayKeyOf, weekdayOf } from "./dayKey";

export type Priority = "low" | "medium" | "high" | "urgent";

export interface Draft {
  title: string;
  description: string;
  assigneeId: string;
  priority: Priority;
  tagId: string;
  due: string; // "YYYY-MM-DDTHH:mm" in Brasília time, "" when unknown
}

export const EMPTY_DRAFT: Draft = { title: "", description: "", assigneeId: "", priority: "medium", tagId: "", due: "" };

export interface ParseContext {
  users: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  now?: Date;
}

export interface ParseResult {
  draft: Draft;
  notes: string[];
  isFollowUp: boolean;
}

export const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
export const DEFAULT_TIME = "18:00";

export interface Range { start: number; end: number }

export function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const pad = (n: number) => String(n).padStart(2, "0");
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const validYMD = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);

function rangeOf(m: RegExpExecArray): Range {
  return { start: m.index, end: m.index + m[0].length };
}

// ---------- priority ----------
const PRIORITY_MAP: Record<string, Priority> = { urgente: "urgent", urgentissimo: "urgent", maxima: "urgent", alta: "high", media: "medium", baixa: "low" };

export function findPriority(n: string): { value: Priority; range: Range } | null {
  const tries = [
    /\bprioridade\s*(?:[:=-]\s*|e\s+|de\s+)?(urgente|maxima|alta|media|baixa)\b/,
    /\b(urgente|alta|media|baixa)\s+prioridade\b/,
    /\b(urgente|urgentissimo)\b/,
  ];
  for (const re of tries) {
    const m = re.exec(n);
    if (m) return { value: PRIORITY_MAP[m[1]], range: rangeOf(m) };
  }
  return null;
}

// ---------- time ----------
export function findTime(n: string): { h: number; m: number; range: Range } | null {
  const lead = "(?:\\b(?:ate|as|a)\\s+(?:as\\s+)?)?";
  let m = new RegExp(lead + "\\b([01]?\\d|2[0-3])\\s*(?::|h)\\s*([0-5]\\d)\\b").exec(n);
  if (m) return { h: +m[1], m: +m[2], range: rangeOf(m) };
  m = new RegExp(lead + "\\b([01]?\\d|2[0-3])\\s*h\\b").exec(n);
  if (m) return { h: +m[1], m: 0, range: rangeOf(m) };
  m = /\b(?:ate\s+as|ate|as|a\s+partir\s+das)\s+([01]?\d|2[0-3])\b(?!\s*(?:[:./-]\s*\d|h\b|de\b|dias?\b|horas?\b|mx\b|%|\d))/.exec(n);
  if (m) return { h: +m[1], m: 0, range: rangeOf(m) };
  return null;
}

// ---------- date ----------
const WEEKDAY_INDEX: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
// Every piece starts with \b: otherwise the article "a" could be taken from the end of a word ("transportadora hoje").
const DATE_LEAD = "(?:\\b(?:para|pra|ate|no|em|na)\\s+)?(?:\\b(?:o|a)\\s+)?(?:\\b(?:dia|dai|data)\\s+)?";

export function findDate(n: string, today: string, firstLineEnd: number): { key: string; range: Range } | null {
  const [ty, tm, td] = today.split("-").map(Number);
  let m: RegExpExecArray | null;

  m = new RegExp(DATE_LEAD + "\\b(\\d{4})-(\\d{2})-(\\d{2})\\b").exec(n);
  if (m && validYMD(+m[1], +m[2], +m[3])) return { key: `${m[1]}-${m[2]}-${m[3]}`, range: rangeOf(m) };

  m = new RegExp(DATE_LEAD + "\\bdepois\\s+de\\s+amanha\\b").exec(n);
  if (m) return { key: addDays(today, 2), range: rangeOf(m) };
  m = new RegExp(DATE_LEAD + "\\bamanha\\b").exec(n);
  if (m) return { key: addDays(today, 1), range: rangeOf(m) };
  m = new RegExp(DATE_LEAD + "\\bhoje\\b").exec(n);
  if (m) return { key: today, range: rangeOf(m) };

  // dd/mm, dd.mm, dd-mm, optionally with a year. Numbers like "2.5" in a later line are not dates unless a keyword precedes them.
  const numRe = new RegExp(DATE_LEAD + "\\b(\\d{1,2})\\s*[./-]\\s*(\\d{1,2})(?:\\s*[./-]\\s*(\\d{4}|\\d{2}))?\\b", "g");
  while ((m = numRe.exec(n))) {
    const day = +m[1];
    const month = +m[2];
    const lead = m[0].slice(0, m[0].search(/\d/));
    const hasKeyword = lead.trim().length > 0;
    const sep = m[0].slice(m[0].search(/\d/)).match(/[./-]/)?.[0];
    // Without a keyword ("dia", "até", "para"...) only unambiguous shapes count: dd/mm, a year, or a day above 12.
    // This keeps "preço 2.5" from being read as the 2nd of May.
    const clearlyADate = sep === "/" || !!m[3] || day > 12;
    if (!hasKeyword && !(m.index < firstLineEnd && clearlyADate)) continue;
    let year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : ty;
    if (!validYMD(year, month, day)) continue;
    const key = `${year}-${pad(month)}-${pad(day)}`;
    if (!m[3] && key < today) {
      // A date that only just passed ("18.10" typed on the 19th) is most likely a slip, not next year:
      // keep it and let the caller warn. Only far-past dates ("5/1" typed in October) roll into next year.
      const daysPast = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(year, month - 1, day)) / 86400000);
      if (daysPast > 180) {
        year += 1;
        if (!validYMD(year, month, day)) continue;
        return { key: `${year}-${pad(month)}-${pad(day)}`, range: rangeOf(m) };
      }
    }
    return { key, range: rangeOf(m) };
  }

  // "dia 20" (this month, or the next one when the day already passed)
  m = new RegExp("(?:\\b(?:para|pra|ate|no|em|na)\\s+)?(?:\\b(?:o|a)\\s+)?\\bdia\\s+(\\d{1,2})\\b(?!\\s*[./-]\\s*\\d)").exec(n);
  if (m) {
    const day = +m[1];
    let y = ty;
    let mo = tm + (day < td ? 1 : 0);
    for (let i = 0; i < 13; i++) {
      if (mo > 12) { mo = 1; y += 1; }
      if (validYMD(y, mo, day)) return { key: `${y}-${pad(mo)}-${pad(day)}`, range: rangeOf(m) };
      mo += 1;
    }
  }

  m = new RegExp("(?:\\b(?:para|pra|ate|no|na|em)\\s+)?(?:\\b(?:o|a)\\s+)?\\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-?\\s*feira)?\\b").exec(n);
  if (m) {
    const delta = (WEEKDAY_INDEX[m[1]] - weekdayOf(today) + 7) % 7 || 7;
    return { key: addDays(today, delta), range: rangeOf(m) };
  }
  return null;
}

// ---------- assignee / tag ----------
export interface Person { id: string; name: string }

export function findAssignee(n: string, users: Person[], firstLineEnd: number): { user: Person; range: Range; ambiguous: boolean } | null {
  const firsts = users.map((u) => ({ u, f: norm(u.name).trim().split(/\s+/)[0] })).filter((x) => x.f);
  const byWord = (w: string): Person | null => {
    const exact = firsts.filter((x) => x.f === w);
    if (exact.length === 1) return exact[0].u;
    if (exact.length > 1) return null;
    if (w.length >= 3) {
      const pref = firsts.filter((x) => x.f.startsWith(w));
      if (pref.length === 1) return pref[0].u;
    }
    return null;
  };

  const forRe = /\b(?:para|pro|pra)\s+(?:o\s+|a\s+)?([a-z]+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = forRe.exec(n))) {
    const u = byWord(m[1]);
    if (u) return { user: u, range: rangeOf(m), ambiguous: false };
  }

  const hits: { u: Person; range: Range }[] = [];
  for (const x of firsts) {
    const r = new RegExp("\\b" + escapeRe(x.f) + "\\b").exec(n);
    if (r) hits.push({ u: x.u, range: rangeOf(r) });
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.range.start - b.range.start);
  const inFirstLine = hits.find((h) => h.range.start < firstLineEnd);
  const pick = inFirstLine ?? hits[0];
  return { user: pick.u, range: pick.range, ambiguous: hits.length > 1 };
}

export function findTag(n: string, tags: Person[]): Person | null {
  for (const t of tags) {
    const tn = norm(t.name).trim();
    if (tn && new RegExp("\\b" + escapeRe(tn) + "\\b").test(n)) return t;
  }
  return null;
}

// ---------- text cleanup ----------
export function stripRanges(text: string, lineStart: number, ranges: Range[]): string {
  const lineEnd = lineStart + text.length;
  const cuts = ranges
    .filter((r) => r.start < lineEnd && r.end > lineStart)
    .map((r) => ({ start: Math.max(r.start, lineStart) - lineStart, end: Math.min(r.end, lineEnd) - lineStart }))
    .sort((a, b) => a.start - b.start);
  // Overlapping ranges must be merged first: cutting them one by one would also eat the text after them.
  const merged: { start: number; end: number }[] = [];
  for (const c of cuts) {
    const last = merged[merged.length - 1];
    if (last && c.start <= last.end) last.end = Math.max(last.end, c.end);
    else merged.push({ ...c });
  }
  let out = text;
  for (let i = merged.length - 1; i >= 0; i--) out = out.slice(0, merged[i].start) + " " + out.slice(merged[i].end);
  return out;
}

const EDGE_WORD = "(?:para|pra|pro|o|a|os|as|ate|no|em|dia|dai|de|do|da|e|com|por|favor)";

export function cleanTitle(s: string, aggressive: boolean): string {
  let t = s.replace(/^[\s\-–—•*·.,;:]+/, "");
  if (aggressive) {
    t = t.replace(/^(?:passar|passa|criar|cria|abrir|abre|mandar|manda|enviar|envia|nova)?\s*(?:uma\s+)?tarefa\b[\s,.:;-]*/i, "");
    // A command verb left alone before a colon/comma ("Criar: subir criativos"); never a verb that starts the real title.
    t = t.replace(/^(?:passar|passa|criar|cria|abrir|abre|mandar|manda|enviar|envia|programar|aplicar|aplica|registrar|registre|colocar|coloque|adicionar|adicione)\s*[:,;-]\s*/i, "");
    for (let i = 0; i < 6; i++) {
      const next = t.replace(new RegExp("^" + EDGE_WORD + "\\b[\\s,.:;-]*", "i"), "");
      if (next === t) break;
      t = next;
    }
    for (let i = 0; i < 6; i++) {
      const next = t.replace(new RegExp("[\\s,.:;-]+" + EDGE_WORD + "$", "i"), "");
      if (next === t) break;
      t = next;
    }
  }
  t = t.replace(/[\s,.:;\-–—]+$/, "").replace(/\s{2,}/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

export const STOP = new Set(["passar", "passa", "pra", "para", "pro", "o", "a", "os", "as", "dia", "dai", "ate", "de", "do", "da", "e", "tarefa", "criar", "cria", "nova", "mandar", "manda", "enviar", "envia", "favor", "por", "ok", "entao"]);

export function formatDue(due: string): string {
  if (!due) return "";
  const [d, t] = due.split("T");
  const [, mo, da] = d.split("-");
  return `${da}/${mo} às ${t}`;
}

// Brasília wall-clock string -> absolute instant (ISO), independent of the browser's time zone.
export function dueToIso(due: string): string {
  return new Date(`${due}:00-03:00`).toISOString();
}

// ---------- main ----------
export function parseTaskMessage(text: string, ctx: ParseContext, base?: Draft): ParseResult {
  const now = ctx.now ?? new Date();
  const original = text.normalize("NFC").replace(/\r\n?/g, "\n").replace(/^\s+/, "");
  const n = norm(original);
  const today = dayKeyOf(now);
  const nowMinutes = (() => {
    const b = new Date(now.getTime() - BRT_OFFSET_MS);
    return b.getUTCHours() * 60 + b.getUTCMinutes();
  })();

  const nl = original.indexOf("\n");
  const firstLineEnd = nl < 0 ? original.length : nl;

  // Non-empty lines with their offsets in the original text.
  const lines: { text: string; start: number }[] = [];
  let pos = 0;
  for (const raw of original.split("\n")) {
    if (raw.trim()) lines.push({ text: raw, start: pos });
    pos += raw.length + 1;
  }

  const prio = findPriority(n);
  const time = findTime(n);
  const date = findDate(n, today, firstLineEnd);
  const who = findAssignee(n, ctx.users, firstLineEnd);
  const tag = findTag(n, ctx.tags);

  const tokenRanges = [prio?.range, time?.range, date?.range, who?.range].filter(Boolean) as Range[];
  const prioRanges = prio ? [prio.range] : [];

  // A short single-line message while a draft is open adjusts that draft instead of starting a new one.
  const looksLikeNewTask = lines.length >= 2 || original.length > 140;
  const isFollowUp = !!base && !!base.title && !looksLikeNewTask;
  const b = isFollowUp ? (base as Draft) : EMPTY_DRAFT;

  let title = b.title;
  let description = b.description;

  if (!isFollowUp) {
    const lineHasToken = (l: { text: string; start: number }) =>
      tokenRanges.some((r) => r.start < l.start + l.text.length && r.end > l.start);
    const isCommand = (l: { text: string; start: number }) => {
      const ln = norm(l.text);
      if (/\btarefa\b/.test(ln)) return true;
      if (!lineHasToken(l)) return false;
      const rest = norm(stripRanges(l.text, l.start, tokenRanges)).replace(/[^a-z\s]/g, " ");
      return rest.split(/\s+/).filter(Boolean).filter((w) => !STOP.has(w)).length === 0;
    };

    let cmdIdx = -1;
    if (lines.length >= 2) {
      if (isCommand(lines[0])) cmdIdx = 0;
      else if (isCommand(lines[lines.length - 1])) cmdIdx = lines.length - 1;
    }

    if (lines.length === 1) {
      title = cleanTitle(stripRanges(lines[0].text, lines[0].start, tokenRanges), true);
    } else if (lines.length > 1) {
      const content = lines.filter((_, i) => i !== cmdIdx);
      const first = content[0];
      title = cleanTitle(stripRanges(first.text, first.start, tokenRanges), lineHasToken(first));
      description = content
        .slice(1)
        .map((l) => stripRanges(l.text, l.start, prioRanges).replace(/[ \t]{2,}/g, " ").trim())
        .filter(Boolean)
        .join("\n");
    }

    if (title.length > 90) {
      const cut = title.lastIndexOf(" ", 90);
      const short = title.slice(0, cut > 40 ? cut : 90).trimEnd() + "…";
      description = [title, description].filter(Boolean).join("\n");
      title = short;
    }
  }

  const notes: string[] = [];

  // Deadline: a date found now wins, otherwise keep what the draft already had.
  const baseDate = b.due ? b.due.slice(0, 10) : "";
  const baseTime = b.due ? b.due.slice(11, 16) : "";
  let dateKey = date?.key ?? baseDate;
  let timeStr = time ? `${pad(time.h)}:${pad(time.m)}` : baseTime;
  if (!dateKey && timeStr) {
    const [hh, mm] = timeStr.split(":").map(Number);
    dateKey = hh * 60 + mm > nowMinutes ? today : addDays(today, 1);
    notes.push(`Não vi o dia do prazo: usei ${dateKey === today ? "hoje" : "amanhã"}. Ajuste se precisar.`);
  }
  if (dateKey && !timeStr) {
    timeStr = DEFAULT_TIME;
    notes.push(`Não vi o horário: deixei ${DEFAULT_TIME}.`);
  }
  const due = dateKey && timeStr ? `${dateKey}T${timeStr}` : "";
  if (date && date.key < today) {
    const [, mo, da] = date.key.split("-");
    notes.push(`A data ${da}/${mo} já passou. Confira o prazo.`);
  }

  const assigneeId = who?.user.id ?? b.assigneeId;
  if (who?.ambiguous) notes.push(`Achei mais de um nome no texto: escolhi ${who.user.name}. Confira o responsável.`);
  if (!assigneeId) notes.push("Não achei o responsável. Diga o nome aqui ou escolha no cartão.");
  if (!due) notes.push("Faltou o prazo (dia e horário). Diga aqui, por exemplo \"amanhã 18h\", ou escolha no cartão.");
  if (!title) notes.push("Não achei o título da tarefa. Escreva no cartão.");

  return {
    draft: {
      title,
      description,
      assigneeId,
      priority: prio?.value ?? b.priority,
      tagId: tag?.id ?? b.tagId,
      due,
    },
    notes,
    isFollowUp,
  };
}
