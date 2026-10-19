// What the Assistente chat understands besides plain tasks: scheduled (recurring) tasks, goals (metas),
// quality incidents (points) and critical incidents. Rule-based and pure: it runs in the browser.
import { addDays, dayKeyOf } from "./dayKey";
import {
  BRT_OFFSET_MS, DEFAULT_TIME, STOP,
  cleanTitle, findAssignee, findDate, findPriority, findTag, findTime, norm, pad, parseTaskMessage, stripRanges,
} from "./taskAssistant";
import type { Draft, ParseContext, Priority, Range } from "./taskAssistant";

// ---------- draft types ----------
export interface ScheduledDraft {
  title: string; description: string; assigneeId: string; priority: Priority; tagId: string;
  time: string; // "HH:mm" Brasília
  days: number[]; // 0 = Sunday ... 6 = Saturday
  dueInHours: number;
}
export interface GoalDraft { title: string; description: string; assigneeId: string; month: string }
export interface QualityDraft { targetUserId: string; reasonKey: string; description: string }
export interface IncidentDraft {
  title: string; description: string; category: string; severity: string;
  occurredAt: string; // "YYYY-MM-DDTHH:mm" Brasília
  relatedUserId: string;
}

export type AssistantDraft =
  | { kind: "task"; draft: Draft }
  | { kind: "scheduled"; draft: ScheduledDraft }
  | { kind: "goal"; draft: GoalDraft }
  | { kind: "quality"; draft: QualityDraft }
  | { kind: "incident"; draft: IncidentDraft };

export type Kind = AssistantDraft["kind"];

export interface AssistantResult {
  current: AssistantDraft | null;
  notes: string[];
  isFollowUp: boolean;
  askIncidentType?: boolean;
}

export const KIND_LABEL: Record<Kind, string> = {
  task: "Tarefa",
  scheduled: "Tarefa programada",
  goal: "Meta",
  quality: "Incidência de qualidade",
  incident: "Incidente crítico",
};

export const INCIDENT_CATEGORIES: { value: string; label: string }[] = [
  { value: "ops_down", label: "Operação fora do ar" },
  { value: "service_failure", label: "Falha de atendimento" },
  { value: "revenue_loss", label: "Perda de venda/dado" },
  { value: "communication", label: "Falha de comunicação" },
  { value: "deadline_miss", label: "Prazo não cumprido" },
  { value: "quality", label: "Problema de qualidade" },
  { value: "process", label: "Falha de processo" },
  { value: "external", label: "Causa externa" },
  { value: "security", label: "Incidente de segurança" },
  { value: "other", label: "Outro" },
];

export const SEVERITIES: { value: string; label: string }[] = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Crítica" },
];

// ---------- shared analysis (same reading as parseTaskMessage, reusable by every kind) ----------
interface Line { text: string; start: number }

export interface Analysis {
  original: string;
  n: string;
  today: string;
  nowMinutes: number;
  firstLineEnd: number;
  lines: Line[];
  prio: ReturnType<typeof findPriority>;
  time: ReturnType<typeof findTime>;
  date: ReturnType<typeof findDate>;
  who: ReturnType<typeof findAssignee>;
  tag: ReturnType<typeof findTag>;
}

export function analyze(text: string, ctx: ParseContext): Analysis {
  const now = ctx.now ?? new Date();
  const original = text.normalize("NFC").replace(/\r\n?/g, "\n").replace(/^\s+/, "");
  const n = norm(original);
  const today = dayKeyOf(now);
  const b = new Date(now.getTime() - BRT_OFFSET_MS);
  const nowMinutes = b.getUTCHours() * 60 + b.getUTCMinutes();
  const nl = original.indexOf("\n");
  const firstLineEnd = nl < 0 ? original.length : nl;
  const lines: Line[] = [];
  let pos = 0;
  for (const raw of original.split("\n")) {
    if (raw.trim()) lines.push({ text: raw, start: pos });
    pos += raw.length + 1;
  }
  return {
    original, n, today, nowMinutes, firstLineEnd, lines,
    prio: findPriority(n),
    time: findTime(n),
    date: findDate(n, today, firstLineEnd),
    who: findAssignee(n, ctx.users, firstLineEnd),
    tag: findTag(n, ctx.tags),
  };
}

interface ExtractOptions {
  strip: ("prio" | "time" | "date" | "who")[];
  extra?: Range[]; // more text to remove (recurrence words, command phrases, severity...)
  commandRe?: RegExp; // a line with this word is the "command" line ("criar meta ...") and not part of the content
  descStrip?: Range[]; // removed from description lines (default: the priority phrase)
}

// Title and description from the pasted text: the first content line is the title, the rest is the description.
export function extractText(a: Analysis, opts: ExtractOptions): { title: string; description: string } {
  const tokenRanges: Range[] = [];
  if (opts.strip.includes("prio") && a.prio) tokenRanges.push(a.prio.range);
  if (opts.strip.includes("time") && a.time) tokenRanges.push(a.time.range);
  if (opts.strip.includes("date") && a.date) tokenRanges.push(a.date.range);
  if (opts.strip.includes("who") && a.who) tokenRanges.push(a.who.range);
  tokenRanges.push(...(opts.extra ?? []));
  const descRanges = opts.descStrip ?? (a.prio && opts.strip.includes("prio") ? [a.prio.range] : []);
  const commandRe = opts.commandRe ?? /\btarefa\b/;

  const lineHasToken = (l: Line) => tokenRanges.some((r) => r.start < l.start + l.text.length && r.end > l.start);
  const isCommand = (l: Line) => {
    if (commandRe.test(norm(l.text))) return true;
    if (!lineHasToken(l)) return false;
    const rest = norm(stripRanges(l.text, l.start, tokenRanges)).replace(/[^a-z\s]/g, " ");
    return rest.split(/\s+/).filter(Boolean).filter((w) => !STOP.has(w)).length === 0;
  };

  const lines = a.lines;
  let cmdIdx = -1;
  if (lines.length >= 2) {
    if (isCommand(lines[0])) cmdIdx = 0;
    else if (isCommand(lines[lines.length - 1])) cmdIdx = lines.length - 1;
  }

  let title = "";
  let description = "";
  if (lines.length === 1) {
    title = cleanTitle(stripRanges(lines[0].text, lines[0].start, tokenRanges), true);
  } else if (lines.length > 1) {
    const content = lines.filter((_, i) => i !== cmdIdx);
    const first = content[0];
    title = cleanTitle(stripRanges(first.text, first.start, tokenRanges), lineHasToken(first));
    description = content
      .slice(1)
      .map((l) => stripRanges(l.text, l.start, descRanges).replace(/[ \t]{2,}/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  }
  // Removing words can leave a space before punctuation ("caiu , perdemos"): tidy it.
  const tidy = (s: string) => s.replace(/[ \t]+([,;.:!?])/g, "$1");
  title = tidy(title);
  description = tidy(description);
  if (title.length > 90) {
    const cut = title.lastIndexOf(" ", 90);
    const short = title.slice(0, cut > 40 ? cut : 90).trimEnd() + "…";
    description = [title, description].filter(Boolean).join("\n");
    title = short;
  }
  return { title, description };
}

function rangeOf(m: RegExpExecArray): Range {
  return { start: m.index, end: m.index + m[0].length };
}

function allRanges(n: string, re: RegExp): Range[] {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const out: Range[] = [];
  let m: RegExpExecArray | null;
  while ((m = g.exec(n))) {
    out.push(rangeOf(m));
    if (m[0].length === 0) g.lastIndex++;
  }
  return out;
}

const firstLineOf = (a: Analysis) => a.n.slice(0, a.firstLineEnd);
const isShortSingleLine = (a: Analysis) => a.lines.length <= 1 && a.original.length <= 140;

// ---------- intent ----------
const SCHEDULE_WORDS =
  /\b(?:todo\s+(?:santo\s+)?dia|todos\s+os\s+dias|diariamente|toda\s+(?:segunda|terca|quarta|quinta|sexta|sabado|domingo|semana)|todas\s+as\s+(?:segundas|tercas|quartas|quintas|sextas|sabados|domingos)|semanalmente|dias\s+uteis|(?:de\s+)?(?:segunda|terca|quarta|quinta|sexta)(?:-?\s*feira)?\s+(?:a|ate)\s+(?:terca|quarta|quinta|sexta|sabado|domingo)(?:-?\s*feira)?|programad[ao]|programar|recorrente|se\s+repete|repetir)\b/;
const POINTS_CMD = /\b(?:colocar|coloque|aplicar|aplique|dar|lancar|lance|descontar|desconte|tirar|tire)\s+(?:\d+(?:[.,]\d+)?\s+)?pontos?\b/;
const NEVER = /(?!)/; // these kinds drop a line as "command" only when nothing but command words and tokens is left in it
const GOAL_CMD = /\b(?:(?:criar|cria|nova|novo|adicionar|adicione|cadastrar|cadastre|colocar|registrar|registre|passar|passa|definir|defina|lancar|lance)\s+)?(?:uma\s+|a\s+)?metas?\b/;
const INCIDENT_CMD = /\b(?:(?:criar|cria|aplicar|aplica|aplique|colocar|coloque|registrar|registre|lancar|lance|dar|passar|adicionar|adicione)\s+)?(?:uma\s+|um\s+|a\s+|o\s+)?(?:incidencias?|incidentes?)\b/;

export type Intent = "task" | "scheduled" | "goal" | "incident";

export function detectIntent(a: Analysis): Intent {
  const first = firstLineOf(a);
  const hasTarefa = /\btarefa\b/.test(first);
  if (!hasTarefa && (/\b(?:incidencias?|incidentes?)\b/.test(first) || POINTS_CMD.test(first))) return "incident";
  if (!hasTarefa && (GOAL_CMD.test(first) && (/^\s*metas?\b/.test(first) || /\b(?:criar|cria|nova|novo|adicionar|adicione|cadastrar|cadastre|colocar|registrar|registre|passar|passa|definir|defina|lancar|lance)\s+(?:uma\s+|a\s+)?metas?\b/.test(first)))) return "goal";
  if (SCHEDULE_WORDS.test(first)) return "scheduled";
  return "task";
}

// ---------- scheduled (recurring) task ----------
const WD_NAMES = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
const WD_RE = "(domingo|segunda|terca|quarta|quinta|sexta|sabado)s?(?:-?\\s*feiras?)?";
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function findDays(n: string, firstLineEnd: number): { days: number[] | null; ranges: Range[]; weeklyWithoutDay: boolean } {
  const first = n.slice(0, firstLineEnd);
  const empty = { days: null as number[] | null, ranges: [] as Range[], weeklyWithoutDay: false };

  const allDays = allRanges(first, /\b(?:todo\s+(?:santo\s+)?dia|todos\s+os\s+dias|diariamente|diario)\b/);
  if (allDays.length) return { days: ALL_DAYS, ranges: allDays, weeklyWithoutDay: false };

  const span = new RegExp("\\b(?:de\\s+)?" + WD_RE + "\\s+(?:a|ate)\\s+" + WD_RE + "\\b").exec(first);
  if (span) {
    const from = WD_NAMES.indexOf(span[1]);
    const to = WD_NAMES.indexOf(span[2]);
    const days: number[] = [];
    for (let d = from; ; d = (d + 1) % 7) {
      days.push(d);
      if (d === to || days.length > 7) break;
    }
    return { days: days.sort((x, y) => x - y), ranges: [rangeOf(span)], weeklyWithoutDay: false };
  }

  const uteis = allRanges(first, /(?:\b(?:nos|nas|aos)\s+)?\bdias\s+uteis\b/);
  if (uteis.length) return { days: [1, 2, 3, 4, 5], ranges: uteis, weeklyWithoutDay: false };

  if (/\b(?:toda|todas|cada|semanalmente|sempre)\b/.test(first)) {
    const re = new RegExp("(?:\\b(?:toda|todas)(?:\\s+as)?\\s+)?\\b" + WD_RE + "\\b", "g");
    const days = new Set<number>();
    const ranges: Range[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(first))) {
      days.add(WD_NAMES.indexOf(m[1]));
      ranges.push(rangeOf(m));
    }
    if (days.size) return { days: [...days].sort((x, y) => x - y), ranges, weeklyWithoutDay: false };
    const weekly = allRanges(first, /\b(?:toda\s+semana|semanalmente)\b/);
    if (weekly.length) return { days: null, ranges: weekly, weeklyWithoutDay: true };
  }
  return empty;
}

const SCHEDULE_NOISE = [
  /\btarefas?\s+(?:programad[ao]s?|recorrentes?)\b/g,
  /\b(?:programad[ao]s?|recorrentes?)\b/g,
  /\b(?:se\s+repete|repetir|programar)\b/g,
];

function scheduleNoiseRanges(n: string): Range[] {
  return SCHEDULE_NOISE.flatMap((re) => allRanges(n, re));
}

function emptyScheduled(): ScheduledDraft {
  return { title: "", description: "", assigneeId: "", priority: "medium", tagId: "", time: "", days: ALL_DAYS, dueInHours: 24 };
}

export function parseScheduled(text: string, ctx: ParseContext, base?: ScheduledDraft): { draft: ScheduledDraft; notes: string[]; isFollowUp: boolean } {
  const a = analyze(text, ctx);
  const isFollowUp = !!base && !!base.title && isShortSingleLine(a);
  const b = isFollowUp ? (base as ScheduledDraft) : emptyScheduled();
  const d = findDays(a.n, a.firstLineEnd);

  let title = b.title;
  let description = b.description;
  if (!isFollowUp) {
    const t = extractText(a, {
      strip: ["prio", "time", "who"],
      extra: [...d.ranges, ...scheduleNoiseRanges(a.n)],
      commandRe: NEVER,
    });
    title = t.title;
    description = t.description;
  }

  const notes: string[] = [];
  const time = a.time ? `${pad(a.time.h)}:${pad(a.time.m)}` : b.time;
  const days = d.days ?? b.days;
  if (!d.days && !isFollowUp) {
    notes.push(d.weeklyWithoutDay ? "Não vi em qual dia da semana: deixei todos os dias. Ajuste no cartão." : "Não vi os dias: deixei todos os dias. Ajuste no cartão.");
  }
  const assigneeId = a.who?.user.id ?? b.assigneeId;
  if (a.who?.ambiguous) notes.push(`Achei mais de um nome no texto: escolhi ${a.who.user.name}. Confira o responsável.`);
  if (!assigneeId) notes.push("Não achei o responsável. Diga o nome aqui ou escolha no cartão.");
  if (!time) notes.push("Faltou o horário (ex: 18h). Diga aqui ou escolha no cartão.");
  if (!title) notes.push("Não achei o título da tarefa. Escreva no cartão.");

  return {
    draft: { title, description, assigneeId, priority: a.prio?.value ?? b.priority, tagId: a.tag?.id ?? b.tagId, time, days, dueInHours: b.dueInHours },
    notes,
    isFollowUp,
  };
}

// ---------- goal (meta) ----------
const MONTHS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function findMonth(n: string, today: string): { month: string; range: Range } | null {
  const [ty, tm] = today.split("-").map(Number);
  const next = new RegExp("(?:\\b(?:para|no|em)\\s+)?\\b(?:proximo\\s+mes|mes\\s+que\\s+vem)\\b").exec(n);
  if (next) {
    const y = tm === 12 ? ty + 1 : ty;
    const m = tm === 12 ? 1 : tm + 1;
    return { month: `${y}-${pad(m)}`, range: rangeOf(next) };
  }
  const cur = new RegExp("(?:\\b(?:para|no|em)\\s+)?\\b(?:este|esse|neste|nesse)\\s+mes\\b|\\bmes\\s+atual\\b").exec(n);
  if (cur) return { month: `${ty}-${pad(tm)}`, range: rangeOf(cur) };
  const re = new RegExp("(?:\\b(?:para|no|em|do|de|da)\\s+)?(?:\\bmes\\s+de\\s+)?\\b(" + MONTHS.join("|") + ")\\b(?:\\s+de\\s+(\\d{4}))?").exec(n);
  if (!re) return null;
  const idx = MONTHS.indexOf(re[1]) + 1;
  let year = re[2] ? +re[2] : ty;
  if (!re[2] && tm - idx > 6) year += 1; // "meta para janeiro" typed in October means next January
  return { month: `${year}-${pad(idx)}`, range: rangeOf(re) };
}

export function parseGoal(text: string, ctx: ParseContext, base?: GoalDraft): { draft: GoalDraft; notes: string[]; isFollowUp: boolean } {
  const a = analyze(text, ctx);
  const isFollowUp = !!base && !!base.title && isShortSingleLine(a);
  const curMonth = a.today.slice(0, 7);
  const b = isFollowUp ? (base as GoalDraft) : { title: "", description: "", assigneeId: "", month: curMonth };
  const m = findMonth(a.n, a.today);

  let title = b.title;
  let description = b.description;
  if (!isFollowUp) {
    const t = extractText(a, {
      strip: ["who"],
      extra: [...(m ? [m.range] : []), ...allRanges(a.n, GOAL_CMD)],
      commandRe: NEVER,
      descStrip: [],
    });
    title = t.title;
    description = t.description;
  }

  const notes: string[] = [];
  const assigneeId = a.who?.user.id ?? b.assigneeId;
  if (a.who?.ambiguous) notes.push(`Achei mais de um nome no texto: escolhi ${a.who.user.name}. Confira o responsável.`);
  if (!assigneeId) notes.push("Não achei o responsável da meta. Diga o nome aqui ou escolha no cartão.");
  if (!title) notes.push("Não achei o título da meta. Escreva no cartão.");
  return { draft: { title, description, assigneeId, month: m?.month ?? b.month }, notes, isFollowUp };
}

// ---------- quality incident (points) ----------
const REASON_KEYWORDS: Record<string, string[]> = {
  duplicate_order: ["duplicado", "duplicada", "duplicou", "duplicidade", "enviado duas vezes", "enviou duas vezes"],
  false_resolved: ["finalizado sem", "finalizou sem", "marcou como finalizado", "sem resolver", "nao resolveu", "nao foi resolvido", "fechou sem resolver"],
  return_caused: ["devolucao", "devolveu", "devolvido", "erro do atendente"],
  poor_quality: ["mal atendimento", "mau atendimento", "ma qualidade", "atendeu mal", "grosseir", "mal educad", "falta de educacao", "sem educacao", "tom de voz", "clareza", "atendimento ruim", "tratou mal"],
  no_team_communication: ["falta de comunicacao", "nao comunicou", "nao avisou a equipe", "efetividade do produto"],
  warranty_not_opened: ["garantia"],
  carrier_no_response: ["transportadora", "novidade acumulada"],
  other_loss: ["prejuizo adicional", "prejuizo na operacao", "outro prejuizo"],
};

export function findQualityReason(n: string): string | null {
  let best: string | null = null;
  let bestScore = 0;
  let tie = false;
  for (const [key, words] of Object.entries(REASON_KEYWORDS)) {
    const score = words.filter((w) => n.includes(w)).length;
    if (score > bestScore) { best = key; bestScore = score; tie = false; }
    else if (score > 0 && score === bestScore) tie = true;
  }
  return tie ? null : best;
}

const QUALITY_HINT = /\b(?:pontos?|qualidade\s+de\s+servico|descontar|desconto)\b/;

export function parseQuality(text: string, ctx: ParseContext, base?: QualityDraft): { draft: QualityDraft; notes: string[]; isFollowUp: boolean } {
  const a = analyze(text, ctx);
  const isFollowUp = !!base && !!(base.reasonKey || base.description) && isShortSingleLine(a);
  const b = isFollowUp ? (base as QualityDraft) : { targetUserId: "", reasonKey: "", description: "" };
  const reasonKey = findQualityReason(a.n);

  let description = b.description;
  if (!isFollowUp) {
    const t = extractText(a, {
      strip: ["who"],
      extra: [...allRanges(a.n, INCIDENT_CMD), ...allRanges(a.n, POINTS_CMD)],
      commandRe: NEVER,
      descStrip: [],
    });
    description = [t.title, t.description].filter(Boolean).join("\n");
  }

  const notes: string[] = [];
  const targetUserId = a.who?.user.id ?? b.targetUserId;
  if (a.who?.ambiguous) notes.push(`Achei mais de um nome no texto: escolhi ${a.who.user.name}. Confira a pessoa.`);
  if (!targetUserId) notes.push("Não achei a pessoa da incidência. Diga o nome aqui ou escolha no cartão.");
  const finalReason = reasonKey ?? b.reasonKey;
  if (!finalReason) notes.push("Não consegui ligar a um motivo da lista de pontos. Escolha o motivo no cartão.");
  if (!description.trim()) notes.push("Faltou a descrição do que aconteceu. Escreva no cartão.");
  return { draft: { targetUserId, reasonKey: finalReason, description }, notes, isFollowUp };
}

// ---------- critical incident ----------
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  ops_down: ["fora do ar", "caiu", "derrubad", "indisponivel", "offline", "parou de funcionar"],
  revenue_loss: ["perda de venda", "perdeu venda", "perda de receita", "perda de dado", "venda perdida", "perdemos venda"],
  service_failure: ["falha de atendimento", "falha no atendimento", "cliente reclamou"],
  communication: ["falha de comunicacao", "falta de comunicacao", "nao comunicou", "nao avisou"],
  deadline_miss: ["prazo nao cumprido", "estourou o prazo", "perdeu o prazo"],
  quality: ["problema de qualidade", "defeito"],
  process: ["falha de processo", "falha no processo"],
  security: ["seguranca", "invasao", "vazamento", "hackea", "senha vazada"],
  external: ["causa externa", "fornecedor", "terceiro"],
};

export function findIncidentCategory(n: string): string | null {
  for (const [key, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => n.includes(w))) return key;
  }
  return null;
}

const SEVERITY_MAP: Record<string, string> = {
  critica: "critical", critico: "critical", gravissima: "critical", gravissimo: "critical", urgente: "critical",
  alta: "high", grave: "high", media: "medium", moderada: "medium", baixa: "low", leve: "low",
};

export function findSeverity(n: string): { value: string; range: Range } | null {
  const tries = [
    /\b(?:gravidade|severidade|prioridade)\s*(?:[:=-]\s*|e\s+|de\s+)?(critica|critico|gravissim[ao]|urgente|alta|grave|media|moderada|baixa|leve)\b/,
    /\b(critica|critico|gravissim[ao]|alta|grave|media|baixa)\s+(?:gravidade|severidade|prioridade)\b/,
    /\b(critica|critico|gravissim[ao])\b/,
  ];
  for (const re of tries) {
    const m = re.exec(n);
    if (m) return { value: SEVERITY_MAP[m[1]] ?? "high", range: rangeOf(m) };
  }
  return null;
}

function findPastDay(n: string, today: string): { key: string; range: Range } | null {
  const m = /\b(?:(?:no\s+)?dia\s+)?(anteontem|ontem)\b/.exec(n);
  if (!m) return null;
  return { key: addDays(today, m[1] === "ontem" ? -1 : -2), range: rangeOf(m) };
}

export function decideIncidentType(a: Analysis): "quality" | "incident" | "ask" {
  if (findQualityReason(a.n) || QUALITY_HINT.test(a.n)) return "quality";
  if (findIncidentCategory(a.n) || findSeverity(a.n) || /\b(?:critic[oa]|grave)\b/.test(a.n)) return "incident";
  return "ask";
}

function nowLocal(a: Analysis): string {
  const hh = Math.floor(a.nowMinutes / 60);
  const mm = a.nowMinutes % 60;
  return `${a.today}T${pad(hh)}:${pad(mm)}`;
}

export function parseIncident(text: string, ctx: ParseContext, base?: IncidentDraft): { draft: IncidentDraft; notes: string[]; isFollowUp: boolean } {
  const a = analyze(text, ctx);
  const isFollowUp = !!base && !!base.title && isShortSingleLine(a);
  const b = isFollowUp ? (base as IncidentDraft) : { title: "", description: "", category: "other", severity: "high", occurredAt: nowLocal(a), relatedUserId: "" };
  const sev = findSeverity(a.n) ?? (a.prio ? { value: a.prio.value === "urgent" ? "critical" : a.prio.value, range: a.prio.range } : null);
  const past = findPastDay(a.n, a.today);
  const dateKey = past?.key ?? a.date?.key;

  let title = b.title;
  let description = b.description;
  if (!isFollowUp) {
    const extra: Range[] = [...allRanges(a.n, INCIDENT_CMD)];
    if (sev) extra.push(sev.range);
    if (past) extra.push(past.range);
    const t = extractText(a, {
      strip: ["who", "date", "time"],
      extra,
      commandRe: NEVER,
      descStrip: sev ? [sev.range] : [],
    });
    title = t.title;
    description = t.description;
  }

  let occurredAt = b.occurredAt;
  if (dateKey || a.time) {
    const d = dateKey ?? b.occurredAt.slice(0, 10);
    const t = a.time ? `${pad(a.time.h)}:${pad(a.time.m)}` : dateKey ? DEFAULT_TIME : b.occurredAt.slice(11, 16);
    occurredAt = `${d}T${t}`;
  }

  const notes: string[] = [];
  const category = findIncidentCategory(a.n) ?? b.category;
  if (!title) notes.push("Não achei o título do incidente. Escreva no cartão.");
  if (!isFollowUp && category === "other") notes.push("Não identifiquei a categoria: deixei \"Outro\". Ajuste no cartão se precisar.");
  return {
    draft: { title, description, category, severity: sev?.value ?? b.severity, occurredAt, relatedUserId: a.who?.user.id ?? b.relatedUserId },
    notes,
    isFollowUp,
  };
}

// ---------- orchestrator ----------
export function parseAssistantMessage(
  text: string,
  ctx: ParseContext,
  current: AssistantDraft | null,
  opts?: { forceIncident?: "quality" | "incident" }
): AssistantResult {
  const a = analyze(text, ctx);
  const intent = detectIntent(a);
  const explicit = intent !== "task" || /\btarefa\b/.test(firstLineOf(a)) || !!opts?.forceIncident;

  // Short single-line message while a card is open, with no explicit new request: adjust that card.
  if (current && isShortSingleLine(a) && !explicit) {
    switch (current.kind) {
      case "task": { const r = parseTaskMessage(text, ctx, current.draft); return { current: { kind: "task", draft: r.draft }, notes: r.notes, isFollowUp: true }; }
      case "scheduled": { const r = parseScheduled(text, ctx, current.draft); return { current: { kind: "scheduled", draft: r.draft }, notes: r.notes, isFollowUp: true }; }
      case "goal": { const r = parseGoal(text, ctx, current.draft); return { current: { kind: "goal", draft: r.draft }, notes: r.notes, isFollowUp: true }; }
      case "quality": { const r = parseQuality(text, ctx, current.draft); return { current: { kind: "quality", draft: r.draft }, notes: r.notes, isFollowUp: true }; }
      case "incident": { const r = parseIncident(text, ctx, current.draft); return { current: { kind: "incident", draft: r.draft }, notes: r.notes, isFollowUp: true }; }
    }
  }

  if (intent === "incident" || opts?.forceIncident) {
    const type = opts?.forceIncident ?? decideIncidentType(a);
    if (type === "ask") return { current: null, notes: [], isFollowUp: false, askIncidentType: true };
    if (type === "quality") { const r = parseQuality(text, ctx); return { current: { kind: "quality", draft: r.draft }, notes: r.notes, isFollowUp: false }; }
    const r = parseIncident(text, ctx);
    return { current: { kind: "incident", draft: r.draft }, notes: r.notes, isFollowUp: false };
  }
  if (intent === "goal") { const r = parseGoal(text, ctx); return { current: { kind: "goal", draft: r.draft }, notes: r.notes, isFollowUp: false }; }
  if (intent === "scheduled") { const r = parseScheduled(text, ctx); return { current: { kind: "scheduled", draft: r.draft }, notes: r.notes, isFollowUp: false }; }
  const r = parseTaskMessage(text, ctx);
  return { current: { kind: "task", draft: r.draft }, notes: r.notes, isFollowUp: false };
}

// Is the draft complete enough to create without asking anything?
export function isComplete(c: AssistantDraft): boolean {
  switch (c.kind) {
    case "task": return !!c.draft.title.trim() && !!c.draft.assigneeId && !!c.draft.due;
    case "scheduled": return !!c.draft.title.trim() && !!c.draft.assigneeId && !!c.draft.time && c.draft.days.length > 0;
    case "goal": return !!c.draft.title.trim() && !!c.draft.assigneeId && !!c.draft.month;
    case "quality": return !!c.draft.targetUserId && !!c.draft.reasonKey && !!c.draft.description.trim();
    case "incident": return !!c.draft.title.trim() && !!c.draft.category && !!c.draft.severity && !!c.draft.occurredAt;
  }
}
