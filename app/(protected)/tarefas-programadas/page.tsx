"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import clsx from "clsx";
import { ScheduledTask, Tag, User } from "@/types";
import { describeSchedule, WEEKDAY_LABELS } from "@/lib/scheduleFormat";
import { CalendarClock, Plus, Pencil, Trash2, Pause, Play } from "lucide-react";

interface FormState {
  title: string;
  description: string;
  assigneeId: string;
  priority: string;
  tagId: string;
  timeOfDay: string;
  daysOfWeek: number[];
  dueInHours: string;
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const EMPTY_FORM: FormState = {
  title: "", description: "", assigneeId: "", priority: "medium", tagId: "",
  timeOfDay: "18:00", daysOfWeek: ALL_DAYS, dueInHours: "24",
};

const PRIORITY_LABELS: Record<string, string> = { low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente" };

export default function TarefasProgramadasPage() {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string })?.id;

  const [schedules, setSchedules] = useState<ScheduledTask[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ScheduledTask | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ScheduledTask | null>(null);

  useEffect(() => { fetch("/api/users").then((r) => r.json()).then(setUsers); }, []);
  useEffect(() => { fetch("/api/tags").then((r) => r.json()).then(setTags); }, []);
  useEffect(() => {
    if (!userId) return;
    fetch(`/api/users/${userId}/permissions`).then((r) => r.json()).then((p) => {
      setPermissions(p);
      setPermissionsLoaded(true);
    });
  }, [userId]);

  const canAccess = permissions.create_task;

  const load = useCallback(async () => {
    if (!canAccess) return;
    const res = await fetch("/api/scheduled-tasks");
    if (res.ok) setSchedules(await res.json());
    setLoading(false);
  }, [canAccess]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setShowForm(true);
  }

  function openEdit(s: ScheduledTask) {
    setEditing(s);
    setForm({
      title: s.title,
      description: s.description ?? "",
      assigneeId: s.assigneeId,
      priority: s.priority,
      tagId: s.tagId ?? "",
      timeOfDay: s.timeOfDay,
      daysOfWeek: s.daysOfWeek,
      dueInHours: String(s.dueInHours),
    });
    setFormError("");
    setShowForm(true);
  }

  function toggleDay(day: number) {
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(day) ? f.daysOfWeek.filter((d) => d !== day) : [...f.daysOfWeek, day].sort((a, b) => a - b),
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.daysOfWeek.length === 0) { setFormError("Escolha pelo menos um dia da semana"); return; }
    setSubmitting(true);
    setFormError("");
    const res = await fetch(editing ? `/api/scheduled-tasks/${editing.id}` : "/api/scheduled-tasks", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        description: form.description,
        assigneeId: form.assigneeId,
        priority: form.priority,
        tagId: form.tagId || null,
        timeOfDay: form.timeOfDay,
        daysOfWeek: form.daysOfWeek,
        dueInHours: Number(form.dueInHours),
      }),
    });
    setSubmitting(false);
    if (!res.ok) { setFormError((await res.json()).error); return; }
    setShowForm(false);
    setEditing(null);
    load();
  }

  async function toggleActive(s: ScheduledTask) {
    await fetch(`/api/scheduled-tasks/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !s.active }),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/scheduled-tasks/${id}`, { method: "DELETE" });
    setDeleteTarget(null);
    load();
  }

  if (permissionsLoaded && !canAccess) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center py-20">
        <CalendarClock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Você não tem acesso a essa área. Peça a um admin para liberar a permissão &quot;Criar tarefas&quot;.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center shadow-lg shrink-0">
            <CalendarClock className="w-5 h-5 text-white" strokeWidth={2.25} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Tarefas Programadas</h1>
            <p className="text-sm text-gray-500">Tarefas que chegam sozinhas pra alguém, no horário e nos dias que você escolher</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Nova tarefa programada
        </button>
      </div>

      {loading && <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>}
      {!loading && schedules.length === 0 && (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-2xl">
          <CalendarClock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Nenhuma tarefa programada ainda</p>
        </div>
      )}

      <div className="space-y-3">
        {schedules.map((s) => (
          <div key={s.id} className={clsx("bg-white rounded-xl border border-gray-200 p-4 shadow-sm", !s.active && "opacity-60")}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className="inline-flex items-center bg-violet-50 text-violet-700 px-2 py-0.5 rounded-md font-medium text-xs">
                    {s.assignee.name}
                  </span>
                  <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-medium text-xs">
                    <CalendarClock className="w-3 h-3" /> {describeSchedule(s.timeOfDay, s.daysOfWeek)}
                  </span>
                  {s.tag && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium text-white" style={{ backgroundColor: s.tag.color }}>
                      {s.tag.name}
                    </span>
                  )}
                  {!s.active && <span className="text-xs font-medium text-orange-600">Pausada</span>}
                </div>
                <p className="font-medium text-gray-900 leading-snug">{s.title}</p>
                {s.description && <p className="text-sm text-gray-500 mt-0.5">{s.description}</p>}
                <p className="text-xs text-gray-400 mt-2">
                  Prioridade {PRIORITY_LABELS[s.priority] ?? s.priority} · prazo de {s.dueInHours}h · criada por {s.creator.name}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => toggleActive(s)}
                  className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                  title={s.active ? "Pausar" : "Retomar"}
                >
                  {s.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button onClick={() => openEdit(s)} className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors" title="Editar">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => setDeleteTarget(s)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-gray-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">{editing ? "Editar tarefa programada" : "Nova tarefa programada"}</h2>
            </div>
            <form onSubmit={submit} className="px-6 py-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Título *</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Descrição</label>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Responsável *</label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={form.assigneeId}
                    onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
                    required
                  >
                    <option value="">Selecione...</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Prioridade</label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  >
                    {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Horário (Brasília) *</label>
                  <input
                    type="time"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={form.timeOfDay}
                    onChange={(e) => setForm({ ...form, timeOfDay: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Prazo (horas)</label>
                  <input
                    type="number"
                    min={1}
                    max={720}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={form.dueInHours}
                    onChange={(e) => setForm({ ...form, dueInHours: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Dias da semana</label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_DAYS.map((d) => {
                    const on = form.daysOfWeek.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(d)}
                        className={clsx(
                          "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                          on ? "bg-violet-600 text-white border-violet-600" : "bg-white text-gray-600 border-gray-200 hover:border-violet-300"
                        )}
                      >
                        {WEEKDAY_LABELS[d]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">País</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.tagId}
                  onChange={(e) => setForm({ ...form, tagId: e.target.value })}
                >
                  <option value="">Nenhum</option>
                  {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 font-medium">
                  {submitting ? "Salvando..." : editing ? "Salvar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-gray-900 text-sm mb-2">Excluir tarefa programada?</p>
            <p className="text-sm text-gray-600 mb-3">Não vai criar mais tarefas a partir de agora. As que já foram criadas continuam.</p>
            <p className="text-sm font-medium text-gray-800 bg-gray-50 rounded-lg px-3 py-2 mb-4 truncate">{deleteTarget.title}</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={() => remove(deleteTarget.id)} className="flex-1 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
