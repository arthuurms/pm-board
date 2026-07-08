"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { User } from "@/types";
import { PriorityBadge } from "@/components/ui/Badge";
import { CalendarCheck, Plus, Trash2, X, Check } from "lucide-react";
import clsx from "clsx";

interface DailyTask {
  id: string;
  title: string;
  description?: string | null;
  priority: string;
  assignee: { id: string; name: string };
  creator: { id: string; name: string };
  completions: { id: string; date: string; userId: string }[];
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const PRIORITY_OPTIONS = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

function DailyTaskRow({ task, today, onToggle, onDelete }: {
  task: DailyTask;
  today: string;
  onToggle: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}) {
  const doneToday = task.completions.some((c) => c.date === today);
  return (
    <div
      className={clsx(
        "bg-white rounded-xl border p-4 shadow-sm flex items-start gap-3 transition-all",
        doneToday && "border-green-200 bg-green-50"
      )}
    >
      <button
        onClick={() => onToggle(task.id)}
        className={clsx(
          "mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
          doneToday ? "bg-green-500 border-green-500 text-white" : "border-gray-300 hover:border-violet-400"
        )}
      >
        {doneToday && <Check className="w-3.5 h-3.5" />}
      </button>

      <div className="flex-1 min-w-0">
        <p className={clsx("font-medium text-gray-900", doneToday && "line-through text-gray-400")}>
          {task.title}
        </p>
        {task.description && <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <PriorityBadge priority={task.priority} />
          <span className="text-xs text-gray-400">→ {task.assignee.name}</span>
          {doneToday && (
            <span className="text-xs text-green-600 font-medium bg-green-100 px-2 py-0.5 rounded">
              Feito hoje ✓
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => onDelete(task.id)}
        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
        title="Remover tarefa diária"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function DailyTasksPage() {
  const { data: session } = useSession();
  const currentUser = session?.user as { id?: string; role?: string; name?: string } | undefined;
  const isAdmin = currentUser?.role === "admin";
  const today = todayStr();

  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", assigneeId: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then((list: User[]) => {
      setUsers(list);
      setUsersLoaded(true);
      const defaultId = !isAdmin && currentUser?.id ? currentUser.id : list[0]?.id ?? "";
      setForm((f) => ({ ...f, assigneeId: defaultId }));
    });
  }, [isAdmin, currentUser?.id]);

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (!isAdmin) params.set("assigneeId", currentUser.id);
    else if (filterUser) params.set("assigneeId", filterUser);
    const res = await fetch(`/api/daily-tasks?${params}`);
    setTasks(await res.json());
    setLoading(false);
  }, [isAdmin, currentUser?.id, filterUser]);

  useEffect(() => { load(); }, [load]);

  async function toggleComplete(taskId: string) {
    await fetch(`/api/daily-tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: today }),
    });
    load();
  }

  async function deleteTask(taskId: string) {
    await fetch(`/api/daily-tasks/${taskId}`, { method: "DELETE" });
    load();
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!form.assigneeId) { setFormError("Selecione um responsável"); return; }
    setSubmitting(true);
    setFormError("");
    const res = await fetch("/api/daily-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSubmitting(false);
    if (!res.ok) { setFormError((await res.json()).error); return; }
    setShowForm(false);
    setForm({ title: "", description: "", priority: "medium", assigneeId: users[0]?.id ?? "" });
    load();
  }

  const completedToday = tasks.filter((t) => t.completions.some((c) => c.date === today)).length;
  const total = tasks.length;
  const allDone = total > 0 && completedToday === total;

  // Admins viewing "all" see each person's daily tasks grouped separately,
  // instead of one flat list that reads as a single shared task list.
  const groupedView = isAdmin && !filterUser;
  const groups = groupedView
    ? Array.from(
        tasks.reduce((map, t) => {
          const key = t.assignee.id;
          if (!map.has(key)) map.set(key, { name: t.assignee.name, tasks: [] as DailyTask[] });
          map.get(key)!.tasks.push(t);
          return map;
        }, new Map<string, { name: string; tasks: DailyTask[] }>())
      ).map(([assigneeId, group]) => ({ assigneeId, ...group }))
    : [];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <CalendarCheck className="w-6 h-6 text-violet-600" />
            <h1 className="text-2xl font-bold text-gray-900">Tarefas Diárias</h1>
          </div>
          <p className="text-sm text-gray-500">Rotina fixa — marque o que foi feito hoje</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700"
        >
          <Plus className="w-4 h-4" /> Nova Tarefa Diária
        </button>
      </div>

      {/* Progress — only meaningful for a single person's routine, not the admin's combined "all" view */}
      {!groupedView && total > 0 && (
        <div className={clsx("mb-5 rounded-xl border p-4 shadow-sm", allDone ? "bg-green-50 border-green-200" : "bg-white")}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Progresso de hoje</span>
            <span className={clsx("text-sm font-bold", allDone ? "text-green-600" : "text-violet-700")}>
              {completedToday}/{total}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div
              className={clsx("h-2.5 rounded-full transition-all", allDone ? "bg-green-500" : "bg-violet-500")}
              style={{ width: `${(completedToday / total) * 100}%` }}
            />
          </div>
          {allDone && (
            <p className="text-xs text-green-600 font-medium mt-2 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Todas as tarefas concluídas hoje!
            </p>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="mb-4">
          <select
            className="border rounded-lg px-3 py-1.5 text-sm"
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
          >
            <option value="">Todos os responsáveis</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      )}

      {loading && <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>}

      {!loading && tasks.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <CalendarCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma tarefa diária cadastrada</p>
          <p className="text-xs mt-1">Clique em "Nova Tarefa Diária" para adicionar</p>
        </div>
      )}

      {!loading && groupedView && groups.length > 0 && (
        <div className="space-y-6">
          {groups.map((group) => {
            const groupDone = group.tasks.filter((t) => t.completions.some((c) => c.date === today)).length;
            return (
              <div key={group.assigneeId}>
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Tarefas diárias — {group.name}
                  </p>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {groupDone}/{group.tasks.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {group.tasks.map((task) => (
                    <DailyTaskRow key={task.id} task={task} today={today} onToggle={toggleComplete} onDelete={deleteTask} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !groupedView && (
        <div className="space-y-3">
          {tasks.map((task) => (
            <DailyTaskRow key={task.id} task={task} today={today} onToggle={toggleComplete} onDelete={deleteTask} />
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">Nova Tarefa Diária</h2>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <form onSubmit={submitForm} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="Ex: Verificar e-mails"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="Opcional"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade</label>
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Responsável *</label>
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={form.assigneeId}
                    onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
                    required
                    disabled={!usersLoaded}
                  >
                    {!usersLoaded && <option value="">Carregando...</option>}
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={submitting || !usersLoaded} className="px-4 py-2 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
                  {submitting ? "Criando..." : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
