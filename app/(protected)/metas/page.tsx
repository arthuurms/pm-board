"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Goal, User } from "@/types";
import { Target, Plus, Check, X, Pencil, Trash2 } from "lucide-react";
import clsx from "clsx";

export default function MetasPage() {
  const { data: session } = useSession();
  const currentUser = session?.user as { id?: string; role?: string } | undefined;
  const isAdmin = currentUser?.role === "admin";

  const [goals, setGoals] = useState<Goal[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [filterUser, setFilterUser] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [form, setForm] = useState({ title: "", description: "", assigneeId: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);

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

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (isAdmin && filterUser) params.set("assigneeId", filterUser);
    const res = await fetch(`/api/goals?${params}`);
    setGoals(await res.json());
    setLoading(false);
  }, [currentUser?.id, isAdmin, filterUser]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setForm({ title: "", description: "", assigneeId: filterUser || users[0]?.id || "" });
    setEditGoal(null);
    setShowForm(true);
  }

  function openEdit(goal: Goal) {
    setForm({ title: goal.title, description: goal.description ?? "", assigneeId: goal.assigneeId });
    setEditGoal(goal);
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

  const active = goals.filter((g) => !g.completed);
  const completed = goals.filter((g) => g.completed);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Target className="w-6 h-6 text-violet-600" />
            <h1 className="text-2xl font-bold text-gray-900">Metas</h1>
          </div>
          <p className="text-sm text-gray-500">
            {isAdmin ? "Metas de cada pessoa da equipe" : "Suas metas"}
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
        <div className="mb-5">
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

      {!loading && goals.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma meta cadastrada</p>
        </div>
      )}

      {!loading && (
        <div className="space-y-6">
          {active.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Ativas ({active.length})
              </p>
              <div className="space-y-3">
                {active.map((g) => (
                  <GoalRow key={g.id} goal={g} isAdmin={isAdmin} onToggle={toggleCompleted} onEdit={openEdit} onDelete={() => setDeleteTarget(g)} />
                ))}
              </div>
            </div>
          )}

          {completed.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Concluídas ({completed.length})
              </p>
              <div className="space-y-3">
                {completed.map((g) => (
                  <GoalRow key={g.id} goal={g} isAdmin={isAdmin} onToggle={toggleCompleted} onEdit={openEdit} onDelete={() => setDeleteTarget(g)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editGoal ? "Editar Meta" : "Nova Meta"}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <form onSubmit={submitForm} className="px-6 py-4 space-y-4">
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
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  rows={2}
                  placeholder="Detalhes opcionais..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
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
        {goal.description && <p className="text-xs text-gray-500 mt-0.5">{goal.description}</p>}
        <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-400">
          {isAdmin && <span>→ {goal.assignee.name}</span>}
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
