"use client";
import { useState, useEffect } from "react";
import { User, Task, Priority, Tag } from "@/types";
import { X, Zap, Paperclip, Loader2 } from "lucide-react";

interface Props {
  users: User[];
  onCreated: () => void;
  onClose: () => void;
  editTask?: Task | null;
}

function todayAt(hour: number, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SHORTCUTS = [
  { label: "Hoje 18h", getValue: () => toLocalInput(todayAt(18)) },
  { label: "Amanhã 9h", getValue: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return toLocalInput(d); } },
  { label: "Em 3 dias", getValue: () => { const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(18, 0, 0, 0); return toLocalInput(d); } },
  { label: "Semana que vem", getValue: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(18, 0, 0, 0); return toLocalInput(d); } },
];

const PRIORITY_OPTIONS: { value: Priority; label: string; color: string }[] = [
  { value: "low", label: "Baixa", color: "bg-slate-100 text-slate-600 border-slate-200" },
  { value: "medium", label: "Média", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "high", label: "Alta", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "urgent", label: "Urgente", color: "bg-red-100 text-red-700 border-red-200" },
];

export default function TaskForm({ users, onCreated, onClose, editTask }: Props) {
  const isEdit = !!editTask;

  const [form, setForm] = useState({
    title: editTask?.title ?? "",
    description: editTask?.description ?? "",
    priority: editTask?.priority ?? "medium",
    dueDate: editTask?.dueDate ? toLocalInput(new Date(editTask.dueDate)) : "",
    assigneeId: editTask?.assigneeId ?? users[0]?.id ?? "",
    attachmentUrl: editTask?.attachmentUrl ?? "",
    attachmentName: editTask?.attachmentName ?? "",
    tagId: editTask?.tagId ?? "",
  });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => { fetch("/api/tags").then((r) => r.json()).then(setTags); }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    setUploading(false);
    if (!res.ok) {
      setError((await res.json()).error || "Erro ao enviar arquivo");
      return;
    }
    const { url, name } = await res.json();
    setForm((f) => ({ ...f, attachmentUrl: url, attachmentName: name }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const url = isEdit ? `/api/tasks/${editTask!.id}` : "/api/tasks";
    const method = isEdit ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      // dueDate comes from a datetime-local input (no timezone info) — convert it
      // using the browser's local timezone before sending, since the server may
      // run in a different timezone (e.g. UTC on Vercel) and would otherwise
      // misinterpret the same clock time as a different instant.
      body: JSON.stringify({ ...form, dueDate: new Date(form.dueDate).toISOString() }),
    });
    setLoading(false);
    if (!res.ok) {
      setError((await res.json()).error || "Erro ao salvar tarefa");
      return;
    }
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">{isEdit ? "Editar Tarefa" : "Nova Tarefa"}</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
        </div>

        <form onSubmit={submit} className="px-6 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="O que precisa ser feito?"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              rows={2}
              placeholder="Detalhes opcionais..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div className="mt-2">
              {form.attachmentUrl ? (
                <div className="flex items-center gap-2 text-xs bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                  <Paperclip className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                  <a href={form.attachmentUrl} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-violet-700 hover:underline">
                    {form.attachmentName}
                  </a>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, attachmentUrl: "", attachmentName: "" })}
                    className="text-gray-400 hover:text-red-500 shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 text-xs text-gray-500 border border-dashed rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-50 hover:border-gray-400 transition-colors w-fit">
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
                  {uploading ? "Enviando..." : "Anexar arquivo (máx. 4MB)"}
                  <input type="file" className="hidden" onChange={handleFileChange} disabled={uploading} />
                </label>
              )}
            </div>
          </div>

          {/* Priority chips */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Prioridade</label>
            <div className="flex gap-2 flex-wrap">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setForm({ ...form, priority: p.value })}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                    form.priority === p.value
                      ? p.color + " ring-2 ring-offset-1 ring-violet-400"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tag (país) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tag (país)</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              value={form.tagId}
              onChange={(e) => setForm({ ...form, tagId: e.target.value })}
            >
              <option value="">Sem tag</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>{t.emoji ? `${t.emoji} ` : ""}{t.name}</option>
              ))}
            </select>
          </div>

          {/* Due date + shortcuts */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Prazo *</label>
            <div className="flex gap-1.5 flex-wrap mb-2">
              {SHORTCUTS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setForm({ ...form, dueDate: s.getValue() })}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors"
                >
                  <Zap className="w-3 h-3" />
                  {s.label}
                </button>
              ))}
            </div>
            <input
              type="datetime-local"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              required
            />
          </div>

          {/* Assignee */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Responsável *</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              value={form.assigneeId}
              onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
              required
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || uploading}
              className="px-4 py-2 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {loading ? (isEdit ? "Salvando..." : "Criando...") : (isEdit ? "Salvar" : "Criar Tarefa")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
