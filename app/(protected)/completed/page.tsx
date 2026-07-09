"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Task, User } from "@/types";
import TaskCard from "@/components/tasks/TaskCard";
import TaskDetail from "@/components/tasks/TaskDetail";
import { CheckCircle2 } from "lucide-react";

export default function CompletedPage() {
  const { data: session } = useSession();
  const currentUser = session?.user as { id?: string; role?: string } | undefined;

  const [tasks, setTasks]         = useState<Task[]>([]);
  const [users, setUsers]         = useState<User[]>([]);
  const [permissions, setPerms]   = useState<Record<string, boolean>>({});
  const [selectedTask, setSelected] = useState<Task | null>(null);
  const [filterUser, setFilterUser] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [loading, setLoading]     = useState(true);

  useEffect(() => { fetch("/api/users").then(r => r.json()).then(setUsers); }, []);

  useEffect(() => {
    if (!currentUser?.id) return;
    fetch(`/api/users/${currentUser.id}/permissions`).then(r => r.json()).then(setPerms);
  }, [currentUser?.id]);

  const isAdmin = currentUser?.role === "admin";

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    const params = new URLSearchParams({ status: "completed" });
    // Collaborators see tasks they're involved in (as assignee or creator); admins can filter by person
    if (!isAdmin) params.set("involvingUserId", currentUser.id!);
    else if (filterUser) params.set("assigneeId", filterUser);
    if (filterMonth) params.set("month", filterMonth);
    const res = await fetch(`/api/tasks?${params}`);
    setTasks(await res.json());
    setLoading(false);
  }, [currentUser?.id, isAdmin, filterUser, filterMonth]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(taskId: string, newStatus: string) {
    await fetch(`/api/tasks/${taskId}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  }

  async function removeRework(taskId: string) {
    await fetch(`/api/tasks/${taskId}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeRework: true }),
    });
    load();
  }

  async function markRework(taskId: string) {
    await fetch(`/api/tasks/${taskId}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addRework: true }),
    });
    load();
  }

  async function approveTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve: true }),
    });
    load();
  }

  // Split into normal vs rework for visual grouping
  const normal = tasks.filter(t => !t.isRework);
  const rework = tasks.filter(t => t.isRework);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <CheckCircle2 className="w-6 h-6 text-green-600" />
        <h1 className="text-2xl font-bold text-gray-900">Concluídas</h1>
        <span className="text-sm text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{tasks.length}</span>
      </div>
      <p className="text-sm text-gray-500 mb-6">Todas as tarefas entregues</p>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        {isAdmin && (
          <select
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            value={filterUser} onChange={e => setFilterUser(e.target.value)}
          >
            <option value="">Todos</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <input
          type="month"
          className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
        />
      </div>

      {loading && <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>}

      {!loading && tasks.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-12">Nenhuma tarefa concluída</p>
      )}

      {!loading && tasks.length > 0 && (
        <div className="space-y-6">
          {/* Normal completed */}
          {normal.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Entregues normalmente ({normal.length})
                </p>
              </div>
              <div className="space-y-3">
                {normal.map(t => (
                  <TaskCard key={t.id} task={t} permissions={permissions}
                    onStatusChange={changeStatus} onMarkRework={markRework} onRemoveRework={removeRework}
                    onApprove={approveTask} currentUserId={currentUser?.id} isAdmin={isAdmin}
                    onClick={() => setSelected(t)} />
                ))}
              </div>
            </div>
          )}

          {/* Rework completed */}
          {rework.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-orange-400" />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Concluídas com retrabalho ({rework.length})
                </p>
              </div>
              <div className="space-y-3">
                {rework.map(t => (
                  <TaskCard key={t.id} task={t} permissions={permissions}
                    onStatusChange={changeStatus} onMarkRework={markRework} onRemoveRework={removeRework}
                    onApprove={approveTask} currentUserId={currentUser?.id} isAdmin={isAdmin}
                    onClick={() => setSelected(t)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedTask && (
        <TaskDetail task={selectedTask} onClose={() => { setSelected(null); load(); }} />
      )}
    </div>
  );
}
