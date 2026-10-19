"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import clsx from "clsx";
import { Bot, Send, Check, X, RotateCcw, Loader2, ClipboardList } from "lucide-react";
import { Tag, User } from "@/types";
import { Draft, EMPTY_DRAFT, Priority, dueToIso, formatDue, parseTaskMessage } from "@/lib/taskAssistant";

interface Message {
  id: number;
  role: "user" | "bot";
  text: string;
  notes?: string[];
  createdTaskTitle?: string;
}

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

const GREETING: Message = {
  id: 0,
  role: "bot",
  text:
    "Oi! Cole aqui o pedido do jeito que você escreveria para uma pessoa e eu monto a tarefa. Por exemplo:\n\n" +
    "passar tarefa para o Breno para o dia 18.10 até as 23:00\nadicionar produtos no México novo\nverificar o preço, prioridade alta\n\n" +
    "Eu entendo o responsável, o dia, o horário, a prioridade e o país. Antes de criar, você confere tudo no cartão.",
};

export default function AssistentePage() {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string })?.id;

  const [users, setUsers] = useState<User[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [input, setInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const nextId = useRef(1);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetch("/api/users").then((r) => r.json()).then(setUsers); }, []);
  useEffect(() => { fetch("/api/tags").then((r) => r.json()).then(setTags); }, []);
  useEffect(() => {
    if (!userId) return;
    fetch(`/api/users/${userId}/permissions`).then((r) => r.json()).then((p) => {
      setPermissions(p);
      setPermissionsLoaded(true);
    });
  }, [userId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, draft]);

  const push = useCallback((m: Omit<Message, "id">) => {
    setMessages((prev) => [...prev, { ...m, id: nextId.current++ }]);
  }, []);

  function send() {
    const text = input.trim();
    if (!text) return;
    setError("");
    const result = parseTaskMessage(text, { users, tags }, draft ?? undefined);
    setDraft(result.draft);
    push({ role: "user", text });
    push({
      role: "bot",
      text: result.isFollowUp ? "Ajustei o cartão." : "Entendi! Montei a tarefa abaixo. Confira e clique em Criar tarefa.",
      notes: result.notes,
    });
    setInput("");
  }

  async function create() {
    if (!draft) return;
    setCreating(true);
    setError("");
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        priority: draft.priority,
        dueDate: dueToIso(draft.due),
        assigneeId: draft.assigneeId,
        tagId: draft.tagId || null,
      }),
    });
    setCreating(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Não consegui criar a tarefa. Tente de novo.");
      return;
    }
    const who = users.find((u) => u.id === draft.assigneeId)?.name ?? "o responsável";
    push({
      role: "bot",
      text: `Pronto! Criei a tarefa "${draft.title.trim()}" para ${who}, com prazo ${formatDue(draft.due)}. Ela já aparece no painel de Tarefas dele.`,
      createdTaskTitle: draft.title.trim(),
    });
    setDraft(null);
  }

  function discard() {
    setDraft(null);
    setError("");
    push({ role: "bot", text: "Cartão descartado. Pode colar outro pedido." });
  }

  function reset() {
    setMessages([GREETING]);
    setDraft(null);
    setInput("");
    setError("");
  }

  if (permissionsLoaded && !permissions.create_task) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center py-20">
        <Bot className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Você não tem acesso a essa área. Peça a um admin para liberar a permissão &quot;Criar tarefas&quot;.</p>
      </div>
    );
  }

  const missing = {
    title: !!draft && !draft.title.trim(),
    assignee: !!draft && !draft.assigneeId,
    due: !!draft && !draft.due,
  };
  const canCreate = !!draft && !missing.title && !missing.assignee && !missing.due && !creating;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 flex flex-col min-h-screen">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center shadow-lg shrink-0">
            <Bot className="w-5 h-5 text-white" strokeWidth={2.25} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Assistente de tarefas</h1>
            <p className="text-sm text-gray-500">Cole o pedido e eu monto a tarefa</p>
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
                {m.createdTaskTitle && (
                  <Link href="/tasks" className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-violet-700 hover:underline">
                    <ClipboardList className="w-3.5 h-3.5" /> Ver em Tarefas
                  </Link>
                )}
              </div>
            </div>
          )
        )}

        {draft && (
          <div className="flex gap-2.5 items-start">
            <div className="w-8 shrink-0" />
            <div className="flex-1 min-w-0 bg-white border-2 border-violet-300 rounded-2xl shadow-sm p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-violet-700 mb-3">Cartão da tarefa</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Título</label>
                  <input
                    className={clsx("w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500", missing.title ? "border-red-400" : "border-gray-200")}
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Descrição</label>
                  <textarea
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-violet-500"
                    rows={Math.min(8, Math.max(3, draft.description.split("\n").length + 1))}
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Responsável</label>
                    <select
                      className={clsx("w-full border rounded-lg px-3 py-2 text-sm", missing.assignee ? "border-red-400" : "border-gray-200")}
                      value={draft.assigneeId}
                      onChange={(e) => setDraft({ ...draft, assigneeId: e.target.value })}
                    >
                      <option value="">Selecione...</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Prazo (horário de Brasília)</label>
                    <input
                      type="datetime-local"
                      className={clsx("w-full border rounded-lg px-3 py-2 text-sm", missing.due ? "border-red-400" : "border-gray-200")}
                      value={draft.due}
                      onChange={(e) => setDraft({ ...draft, due: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Prioridade</label>
                    <select
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={draft.priority}
                      onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}
                    >
                      {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">País</label>
                    <select
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={draft.tagId}
                      onChange={(e) => setDraft({ ...draft, tagId: e.target.value })}
                    >
                      <option value="">Nenhum</option>
                      {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
              <div className="flex items-center justify-end gap-2 mt-4">
                <button onClick={discard} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:border-red-400 hover:text-red-600">
                  <X className="w-4 h-4" /> Descartar
                </button>
                <button
                  onClick={create}
                  disabled={!canCreate}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Criar tarefa
                </button>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 bg-gray-50 pt-2 pb-5">
        <div className="flex items-end gap-2 bg-white border border-gray-200 rounded-2xl shadow-sm p-2 focus-within:border-violet-400">
          <textarea
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm focus:outline-none max-h-48"
            rows={draft ? 1 : 3}
            placeholder={draft ? "Quer ajustar algo? Ex: amanhã 18h, prioridade urgente, para o Samuel" : "Cole o pedido aqui..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim()}
            className="shrink-0 w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Enviar (Enter)"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5 px-1">Enter envia, Shift+Enter quebra a linha.</p>
      </div>
    </div>
  );
}
