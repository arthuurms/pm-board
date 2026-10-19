"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import clsx from "clsx";
import { Bot, Send, RotateCcw, Paperclip, X, Loader2 } from "lucide-react";
import { Tag, User } from "@/types";
import { AssistantDraft, KIND_LABEL, Kind, isComplete, parseAssistantMessage } from "@/lib/assistantIntents";
import { QUALITY_INCIDENT_REASONS } from "@/lib/qualityIncidents";
import { describeSchedule } from "@/lib/scheduleFormat";
import { formatMonthLabel } from "@/lib/goalMonth";
import { dueToIso, formatDue } from "@/lib/taskAssistant";
import { shrinkImage } from "@/lib/shrinkImage";
import DraftCard, { Photo } from "@/components/assistant/DraftCards";

interface Message {
  id: number;
  role: "user" | "bot";
  text: string;
  notes?: string[];
  link?: { href: string; label: string };
  choices?: { label: string; value: "quality" | "incident" }[];
}

const MAX_PHOTOS = 10;

const GREETING: Message = {
  id: 0,
  role: "bot",
  text:
    "Oi! Cole aqui o que você precisa, do jeito que escreveria para uma pessoa, e eu monto:\n\n" +
    "• Tarefa: \"passar tarefa para o Breno para o dia 18.10 até as 23:00 ...\"\n" +
    "• Tarefa programada: \"tarefa programada para o Breno todo dia às 18:00 ...\"\n" +
    "• Meta: \"criar meta para o Robertão para novembro: ...\"\n" +
    "• Incidência: \"aplicar incidência no Vitor: atendeu mal o cliente\"\n\n" +
    "Se precisar, anexe fotos com o clipe (ou cole com Ctrl+V). Quando entendo tudo, já crio. Se faltar algo, mostro um cartão para você completar.",
};

const DENIED: Record<Kind, string> = {
  task: "criar tarefas",
  scheduled: "criar tarefas programadas",
  goal: "criar metas (só admin)",
  quality: "registrar incidências de qualidade",
  incident: "registrar incidentes",
};

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return { ok: false, error: (await res.json().catch(() => ({}))).error || "Não consegui criar. Tente de novo." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Sem conexão com o servidor. Tente de novo." };
  }
}

export default function AssistentePage() {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string })?.id;
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const [users, setUsers] = useState<User[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [current, setCurrent] = useState<AssistantDraft | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [input, setInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const [pendingText, setPendingText] = useState("");
  const nextId = useRef(1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetch("/api/users").then((r) => r.json()).then(setUsers); }, []);
  useEffect(() => { fetch("/api/tags").then((r) => r.json()).then(setTags); }, []);
  useEffect(() => {
    if (!userId) return;
    fetch(`/api/users/${userId}/permissions`).then((r) => r.json()).then((p) => {
      setPermissions(p);
      setPermissionsLoaded(true);
    });
  }, [userId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, current, photos]);

  const push = useCallback((m: Omit<Message, "id">) => {
    setMessages((prev) => [...prev, { ...m, id: nextId.current++ }]);
  }, []);

  function can(kind: Kind): boolean {
    if (kind === "task" || kind === "scheduled") return !!permissions.create_task;
    if (kind === "goal") return isAdmin;
    if (kind === "quality") return !!permissions.manage_quality_incidents;
    return !!permissions.create_incident;
  }

  // ----- photos -----
  async function addPhotos(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setError(`Máximo de ${MAX_PHOTOS} fotos.`);
      return;
    }
    setError(list.length > room ? `Só cabem mais ${room} foto(s) (máximo de ${MAX_PHOTOS}).` : "");
    setUploading(true);
    for (const f of list.slice(0, room)) {
      const ready = await shrinkImage(f);
      const fd = new FormData();
      fd.append("file", ready);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          setError((await res.json().catch(() => ({}))).error || "Não consegui enviar a foto.");
          continue;
        }
        const data = await res.json();
        setPhotos((prev) => [...prev, { url: data.url, name: data.name }]);
      } catch {
        setError("Sem conexão ao enviar a foto.");
      }
    }
    setUploading(false);
  }

  // ----- create -----
  async function createFrom(cur: AssistantDraft, ph: Photo[]): Promise<boolean> {
    setCreating(true);
    setError("");
    let result: { ok: boolean; error?: string };
    let done: Omit<Message, "id">;

    if (cur.kind === "task") {
      const d = cur.draft;
      const who = users.find((u) => u.id === d.assigneeId)?.name ?? "o responsável";
      result = await postJson("/api/tasks", {
        title: d.title.trim(), description: d.description.trim() || null, priority: d.priority, dueDate: dueToIso(d.due),
        assigneeId: d.assigneeId, tagId: d.tagId || null, attachmentUrl: ph[0]?.url ?? null, attachmentName: ph[0]?.name ?? null,
      });
      done = {
        role: "bot",
        text: `Pronto! Criei a tarefa "${d.title.trim()}" para ${who}, com prazo ${formatDue(d.due)}.${ph[0] ? " A foto foi anexada." : ""} Ela já aparece no painel de Tarefas dele.`,
        link: { href: "/tasks", label: "Ver em Tarefas" },
      };
    } else if (cur.kind === "scheduled") {
      const d = cur.draft;
      const who = users.find((u) => u.id === d.assigneeId)?.name ?? "o responsável";
      result = await postJson("/api/scheduled-tasks", {
        title: d.title.trim(), description: d.description.trim() || null, priority: d.priority, assigneeId: d.assigneeId,
        tagId: d.tagId || null, timeOfDay: d.time, daysOfWeek: d.days, dueInHours: d.dueInHours,
      });
      done = {
        role: "bot",
        text: `Pronto! Programei "${d.title.trim()}" para ${who}: ${describeSchedule(d.time, d.days)}. A primeira tarefa chega na próxima ocorrência do horário.`,
        link: { href: "/tarefas-programadas", label: "Ver Tarefas Programadas" },
      };
    } else if (cur.kind === "goal") {
      const d = cur.draft;
      const who = users.find((u) => u.id === d.assigneeId)?.name ?? "o responsável";
      result = await postJson("/api/goals", { title: d.title.trim(), description: d.description.trim() || null, assigneeId: d.assigneeId, month: d.month });
      done = { role: "bot", text: `Pronto! Criei a meta "${d.title.trim()}" para ${who}, em ${formatMonthLabel(d.month)}.`, link: { href: "/metas", label: "Ver em Metas" } };
    } else if (cur.kind === "quality") {
      const d = cur.draft;
      const who = users.find((u) => u.id === d.targetUserId)?.name ?? "a pessoa";
      const reason = QUALITY_INCIDENT_REASONS.find((r) => r.key === d.reasonKey);
      result = await postJson("/api/quality-incidents", {
        targetUserId: d.targetUserId, reasonKey: d.reasonKey, description: d.description.trim(), proofUrl: ph[0]?.url ?? null, proofName: ph[0]?.name ?? null,
      });
      done = {
        role: "bot",
        text: `Pronto! Registrei a incidência de qualidade para ${who}: ${reason?.label ?? "motivo"} (${(reason?.points ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 1 })} pt).${ph[0] ? " A foto ficou como prova." : ""}`,
        link: { href: "/qualidade", label: "Ver Qualidade de Serviço" },
      };
    } else {
      const d = cur.draft;
      const used = ph.slice(0, MAX_PHOTOS);
      result = await postJson("/api/incidents", {
        title: d.title.trim(), description: d.description.trim() || null, category: d.category, severity: d.severity,
        occurredAt: dueToIso(d.occurredAt), relatedUserId: d.relatedUserId || null,
        attachmentUrls: used.map((p) => p.url), attachmentNames: used.map((p) => p.name),
      });
      done = {
        role: "bot",
        text: `Pronto! Registrei o incidente "${d.title.trim()}"${used.length ? ` com ${used.length} foto${used.length > 1 ? "s" : ""}` : ""}.`,
        link: { href: "/incidents", label: "Ver Incidentes" },
      };
    }

    setCreating(false);
    if (!result.ok) {
      setError(result.error ?? "Não consegui criar. Tente de novo.");
      return false;
    }
    push(done);
    return true;
  }

  // ----- conversation -----
  async function processText(text: string, opts?: { forceIncident?: "quality" | "incident" }) {
    setError("");
    const result = parseAssistantMessage(text, { users, tags }, current, opts);

    if (result.askIncidentType) {
      setPendingText(text);
      push({
        role: "bot",
        text: "Essa incidência é de qual tipo?",
        choices: [
          { label: "Qualidade de serviço (pontos)", value: "quality" },
          { label: "Incidente crítico", value: "incident" },
        ],
      });
      return;
    }

    const cur = result.current;
    if (!cur) return;
    if (!can(cur.kind)) {
      push({ role: "bot", text: `Você não tem permissão para ${DENIED[cur.kind]}. Peça a um admin para liberar.` });
      return;
    }

    // New request understood without any doubt: create it right away.
    if (!result.isFollowUp && isComplete(cur) && result.notes.length === 0) {
      const ok = await createFrom(cur, photos);
      if (ok) {
        setCurrent(null);
        setPhotos([]);
      } else {
        setCurrent(cur);
        push({ role: "bot", text: "Não consegui criar agora. Confira o cartão e tente de novo." });
      }
      return;
    }

    setCurrent(cur);
    push({
      role: "bot",
      text: result.isFollowUp ? "Ajustei o cartão." : `Montei o cartão (${KIND_LABEL[cur.kind]}), mas preciso que você confira. Clique no botão quando estiver certo.`,
      notes: result.notes,
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || creating || uploading) return;
    push({ role: "user", text });
    setInput("");
    await processText(text);
  }

  async function choose(value: "quality" | "incident", label: string) {
    setMessages((prev) => prev.map((m) => (m.choices ? { ...m, choices: undefined } : m)));
    push({ role: "user", text: label });
    await processText(pendingText, { forceIncident: value });
  }

  async function createCard() {
    if (!current) return;
    if (await createFrom(current, photos)) {
      setCurrent(null);
      setPhotos([]);
    }
  }

  function discard() {
    setCurrent(null);
    setPhotos([]);
    setError("");
    push({ role: "bot", text: "Cartão descartado. Pode colar outro pedido." });
  }

  function reset() {
    setMessages([GREETING]);
    setCurrent(null);
    setPhotos([]);
    setInput("");
    setError("");
  }

  if (permissionsLoaded && !permissions.create_task && !isAdmin) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center py-20">
        <Bot className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Você não tem acesso a essa área. Peça a um admin para liberar a permissão &quot;Criar tarefas&quot;.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 flex flex-col min-h-screen">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center shadow-lg shrink-0">
            <Bot className="w-5 h-5 text-white" strokeWidth={2.25} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Assistente</h1>
            <p className="text-sm text-gray-500">Tarefas, tarefas programadas, metas e incidências por mensagem</p>
          </div>
        </div>
        {messages.length > 1 && (
          <button onClick={reset} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-violet-400 hover:text-violet-600">
            <RotateCcw className="w-3.5 h-3.5" /> Nova conversa
          </button>
        )}
      </div>

      <div className="flex-1 space-y-4 pb-4">
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[88%] bg-violet-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm whitespace-pre-wrap break-words">{m.text}</div>
            </div>
          ) : (
            <div key={m.id} className="flex gap-2.5 items-start">
              <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-700 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="max-w-[88%] bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-700 shadow-sm">
                <p className="whitespace-pre-wrap break-words leading-relaxed">{m.text}</p>
                {m.notes && m.notes.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {m.notes.map((n) => (
                      <li key={n} className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-yellow-100 text-yellow-700">{n}</li>
                    ))}
                  </ul>
                )}
                {m.choices && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {m.choices.map((c) => (
                      <button key={c.value} onClick={() => choose(c.value, c.label)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-violet-300 text-violet-700 hover:bg-violet-50">
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
                {m.link && (
                  <Link href={m.link.href} className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-violet-700 hover:underline">
                    {m.link.label}
                  </Link>
                )}
              </div>
            </div>
          )
        )}

        {current && (
          <DraftCard
            current={current}
            setCurrent={setCurrent}
            users={users}
            tags={tags}
            photos={photos}
            onRemovePhoto={(i) => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
            creating={creating}
            error={error}
            onCreate={createCard}
            onDiscard={discard}
          />
        )}
        <div ref={bottomRef} />
      </div>

      <div
        className="sticky bottom-0 bg-gray-50 pt-2 pb-5"
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files?.length) addPhotos(e.dataTransfer.files); }}
      >
        {!current && photos.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {photos.map((p, i) => (
              <div key={p.url} className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-200 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.name} className="w-full h-full object-cover" />
                <button onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 bg-black/60 text-white p-0.5 rounded-bl" title="Remover foto">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {!current && error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <div className={clsx("bg-white border rounded-2xl shadow-sm focus-within:border-violet-400 transition-colors", dragActive ? "border-violet-500 bg-violet-50" : "border-gray-200")}>
          <textarea
            className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-sm leading-relaxed focus:outline-none max-h-48"
            rows={current ? 2 : 3}
            placeholder={current ? "Quer ajustar algo? Ex: amanhã 18h, prioridade urgente, para o Samuel" : "Cole o pedido aqui..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
              if (imgs.length) {
                e.preventDefault();
                addPhotos(imgs);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) addPhotos(e.target.files); e.target.value = ""; }} />
          <div className="flex items-center justify-between gap-3 px-3 pb-2.5 pt-1">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:border-violet-400 hover:text-violet-600 disabled:opacity-50"
              title={`Anexar foto (até ${MAX_PHOTOS}). Também dá para arrastar ou colar com Ctrl+V.`}
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              {uploading ? "Enviando..." : "Anexar foto"}
            </button>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-[11px] text-gray-400">Enter envia · Shift+Enter quebra a linha</span>
              <button
                onClick={send}
                disabled={!input.trim() || creating || uploading}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Enviar (Enter)"
              >
                Enviar <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
