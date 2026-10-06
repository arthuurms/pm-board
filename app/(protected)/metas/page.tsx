"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Goal, User } from "@/types";
import { currentBrtMonth, formatMonthLabel, goalMonth } from "@/lib/goalMonth";
import { Target, Plus, Check, X, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import clsx from "clsx";

interface FormState {
  title: string;
  description: string;
  assigneeId: string;
  month: string;
}

export default function MetasPage() {
  const { data: session } = useSession();
  const currentUser = session?.user as { id?: string; role?: string } | undefined;
  const isAdmin = currentUser?.role === "admin";

  const [goals, setGoals] = useState<Goal[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [filterUser, setFilterUser] = useState("");
  const [toggledMonths, setToggledMonths] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [form, setForm] = useState<FormState>({ title: "", description: "", assigneeId: "", month: currentBrtMonth() });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);

  const thisMonth = currentBrtMonth();

  useEffect(() => { fetch("/api/users").then((r) => r.json()).then(setUsers); }, []);

  // Restore the last person filter so it survives a page reload.
  useEffect(() => {
    const saved = localStorage.getItem("clickfy:metas:filterUser");
    if (saved) setFilterUser(saved);
  }, []);
  useEffect(() => {
    if (filterUser) localStorage.setItem("clickfy:metas:filterUser", filterUser);
    else localStorage.removeItem("clickfy:metas:filterUser");
  }, [filterUser]);

  // `silent` skips the loading-spinner state, used for the background
  // auto-refresh so it doesn't unmount the list while someone is mid-edit.
  const load = useCallback(async (silent = false) => {
    if (!currentUser?.id) return;
    if (!silent) setLoading(true);
    const res = await fetch("/api/goals");
    const data = await res.json();
    setGoals(data);
    if (!silent) setLoading(false);
  }, [currentUser?.id]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh so goals created/updated elsewhere show up without a manual reload.
  useEffect(() => {
    const interval = setInterval(() => load(true), 15000);
    return () => clearInterval(interval);
  }, [load]);

  const countByUser = useMemo(() => {
    const m: Record<string, number> = {};
    for (const g of goals) m[g.assigneeId] = (m[g.assigneeId] ?? 0) + 1;
    return m;
  }, [goals]);

  // Month -> person -> goals. Months newest first; inside a person, open goals first, then by creation order.
  const months = useMemo(() => {
    const filtered = filterUser ? goals.filter((g) => g.assigneeId === filterUser) : goals;
    const byMonth = new Map<string, Goal[]>();
    for (const g of filtered) {
      const ym = goalMonth(g);
      byMonth.set(ym, [...(byMonth.get(ym) ?? []), g]);
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([ym, list]) => {
        const byPerson = new Map<string, { name: string; goals: Goal[] }>();
        for (const g of list) {
          const entry = byPerson.get(g.assigneeId) ?? { name: g.assignee.name, goals: [] };
          entry.goals.push(g);
          byPerson.set(g.assigneeId, entry);
        }
        const people = [...byPerson.entries()]
          .map(([id, v]) => ({
            id,
            name: v.name,
            goals: [...v.goals].sort(
              (a, b) => Number(a.completed) - Number(b.completed) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            ),
          }))
          .sort((a, b) => (a.id === currentUser?.id ? -1 : b.id === currentUser?.id ? 1 : a.name.localeCompare(b.name)));
        return { ym, total: list.length, done: list.filter((g) => g.completed).length, people };
      });
  }, [goals, filterUser, currentUser?.id]);

  // Current month and any month that still has open goals start expanded; fully done past months start collapsed.
  function isOpen(m: { ym: string; total: number; done: number }) {
    return toggledMonths[m.ym] ?? (m.ym === thisMonth || m.done < m.total);
  }

  function openCreate() {
    setForm({ title: "", description: "", assigneeId: filterUser || users[0]?.id || "", month: thisMonth });
    setEditGoal(null);
    setFormError("");
    setShowForm(true);
  }

  function openEdit(goal: Goal) {
    setForm({ title: goal.title, description: goal.description ?? "", assigneeId: goal.assigneeId, month: goalMonth(goal) });
    setEditGoal(goal);
    setFormError("");
    setShowForm(true);
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!form.assigneeId) { setFormError("Selecione um responsável"); return; }
    setSubmitting(true);
    setFormError("");
    const url = editGoal ? `/api/goals/${editGoal.id}` : "/api/goals";
    const method = editGoal ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSubmitting(false);
    if (!res.ok) { setFormError((await res.json()).error); return; }
    setShowForm(false);
    setEditGoal(null);
    load();
  }

  async function toggleCompleted(goal: Goal) {
    await fetch(`/api/goals/${goal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !goal.completed }),
    });
    load();
  }

  async function deleteGoal(id: string) {
    await fetch(`/api/goals/${id}`, { method: "DELETE" });
    setDeleteTarget(null);
    load();
  }

  function pill(value: string, label: string, count: number) {
    const active = filterUser === value;
    return (
      <button
        key={value || "all"}
        onClick={() => setFilterUser(value)}
        className={clsx(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
          active ? "bg-violet-600 text-white border-violet-600" : "bg-white text-gray-700 border-gray-200 hover:border-violet-300"
        )}
      >
        {label}
        <span className={clsx("min-w-5 text-center text-xs px-1.5 py-0.5 rounded-full font-semibold", active ? "bg-white/25 text-white" : "bg-gray-100 text-gray-500")}>
          {count}
        </span>
      </button>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Target className="w-6 h-6 text-violet-600" />
            <h1 className="text-2xl font-bold text-gray-900">Metas</h1>
          </div>
          <p className="text-sm text-gray-500">
            {isAdmin ? "Metas de cada pessoa da equipe, separadas por mês" : "Suas metas, separadas por mês"}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700"
          >
            <Plus className="w-4 h-4" /> Nova Meta
          </button>
        )}
      </div>

      {isAdmin && (
        <div className="flex flex-wrap gap-2 mb-6">
          {pill("", "Todos", goals.length)}
          {users.map((u) => pill(u.id, u.name, countByUser[u.id] ?? 0))}
        </div>
      )}

      {loading && <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>}

      {!loading && months.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma meta cadastrada</p>
        </div>
      )}

      {!loading && (
        <div className="space-y-5">
          {months.map((m) => {
            const open = isOpen(m);
            const pct = m.total ? Math.round((m.done / m.total) * 100) : 0;
            return (
              <section key={m.ym} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => setToggledMonths((t) => ({ ...t, [m.ym]: !open }))}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left"
                >
                  {open ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                  <span className="text-lg font-bold text-gray-900 capitalize flex-1">{formatMonthLabel(m.ym)}</span>
                  {m.ym === thisMonth && <span className="text-[11px] font-semibold uppercase tracking-wide bg-violet-50 text-violet-700 px-2 py-0.5 rounded">Mês atual</span>}
                  <span className="text-xs text-gray-500 tabular-nums">{m.done}/{m.total} concluídas</span>
                  <div className="w-20 bg-gray-100 rounded-full h-1.5 shrink-0">
                    <div className={clsx("h-1.5 rounded-full", pct === 100 ? "bg-green-500" : "bg-violet-500")} style={{ width: `${pct}%` }} />
                  </div>
                </button>

                {open && (
                  <div className="px-5 pb-5 space-y-5 border-t border-gray-100 pt-4">
                    {m.people.map((p) => {
                      const done = p.goals.filter((g) => g.completed).length;
                      return (
                        <div key={p.id}>
                          {(isAdmin || m.people.length > 1) && (
                            <div className="flex items-center gap-2 mb-2">
                              <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center">
                                {p.name[0]?.toUpperCase()}
                              </span>
                              <span className="text-sm font-semibold text-gray-800">{p.name}{p.id === currentUser?.id ? " (você)" : ""}</span>
                              <span className="text-xs text-gray-400 tabular-nums">{done}/{p.goals.length}</span>
                            </div>
                          )}
                          <div className="space-y-2.5">
                            {p.goals.map((g) => (
                              <GoalRow key={g.id} goal={g} isAdmin={isAdmin} onToggle={toggleCompleted} onEdit={openEdit} onDelete={() => setDeleteTarget(g)} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
              <h2 className="text-lg font-semibold">{editGoal ? "Editar Meta" : "Nova Meta"}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <form onSubmit={submitForm} className="px-6 py-4 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="Ex: Aumentar taxa de conversão em 10%"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-y"
                  rows={6}
                  placeholder="Detalhes opcionais..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Responsável *</label>
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={form.assigneeId}
                    onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
                    required
                  >
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mês *</label>
                  <input
                    type="month"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={form.month}
                    onChange={(e) => setForm({ ...form, month: e.target.value })}
                    required
                  />
                </div>
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
                  {submitting ? "Salvando..." : (editGoal ? "Salvar" : "Criar")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 text-red-600" />
              </div>
              <p className="font-semibold text-gray-900 text-sm">Excluir meta?</p>
            </div>
            <p className="text-sm text-gray-600 mb-1">Esta ação não pode ser desfeita:</p>
            <p className="text-sm font-medium text-gray-800 bg-gray-50 rounded-lg px-3 py-2 mb-4 truncate">{deleteTarget.title}</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={() => deleteGoal(deleteTarget.id)} className="flex-1 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GoalRow({ goal, isAdmin, onToggle, onEdit, onDelete }: {
  goal: Goal;
  isAdmin: boolean;
  onToggle: (goal: Goal) => void;
  onEdit: (goal: Goal) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const description = goal.description ?? "";
  const long = description.length > 180 || description.split("\n").length > 4;

  return (
    <div className={clsx(
      "bg-white rounded-xl border p-4 shadow-sm flex items-start gap-3",
      goal.completed && "border-green-200 bg-green-50"
    )}>
      <button
        onClick={() => onToggle(goal)}
        className={clsx(
          "mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
          goal.completed ? "bg-green-500 border-green-500 text-white" : "border-gray-300 hover:border-violet-400"
        )}
        title={goal.completed ? "Reabrir meta" : "Marcar como concluída"}
      >
        {goal.completed && <Check className="w-3.5 h-3.5" />}
      </button>

      <div className="flex-1 min-w-0">
        <p className={clsx("font-medium text-gray-900", goal.completed && "line-through text-gray-400")}>
          {goal.title}
        </p>
        {description && (
          <>
            <p className={clsx("text-xs text-gray-500 mt-1 whitespace-pre-line", long && !expanded && "line-clamp-3")}>
              {description}
            </p>
            {long && (
              <button onClick={() => setExpanded((v) => !v)} className="text-xs font-medium text-violet-600 hover:underline mt-1">
                {expanded ? "Ocultar detalhes" : "Ver detalhes"}
              </button>
            )}
          </>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-400">
          <span>Criada por {goal.creator.name}</span>
        </div>
      </div>

      {isAdmin && (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onEdit(goal)} className="p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors" title="Editar meta">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="Excluir meta">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
