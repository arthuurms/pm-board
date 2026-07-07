"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Task, User } from "@/types";
import TaskCard from "@/components/tasks/TaskCard";
import TaskDetail from "@/components/tasks/TaskDetail";
import { RotateCcw } from "lucide-react";

export default function ReworkPage() {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string })?.id;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [filterUser, setFilterUser] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetch("/api/users").then((r) => r.json()).then(setUsers); }, []);
  useEffect(() => {
    if (!userId) return;
    fetch(`/api/users/${userId}/permissions`).then((r) => r.json()).then(setPermissions);
  }, [userId]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ isRework: "true" });
    if (filterUser) params.set("assigneeId", filterUser);
    if (filterMonth) params.set("month", filterMonth);
    const res = await fetch(`/api/tasks?${params}`);
    setTasks(await res.json());
    setLoading(false);
  }, [filterUser, filterMonth]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(taskId: string, newStatus: string) {
    await fetch(`/api/tasks/${taskId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
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
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addRework: true }),
    });
    load();
  }

  const completed = tasks.filter((t) => t.status === "completed");
  const active = tasks.filter((t) => t.status !== "completed");

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <RotateCcw className="w-6 h-6 text-orange-500" />
        <h1 className="text-2xl font-bold text-gray-900">Concluídas — Retrabalho</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">Tarefas que necessitaram de correção ou re-entrega após conclusão</p>

      <div className="flex flex-wrap gap-3 mb-5">
        <select className="border rounded-lg px-3 py-1.5 text-sm" value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
          <option value="">Todos</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input type="month" className="border rounded-lg px-3 py-1.5 text-sm" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} />
      </div>

      {loading && <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>}

      {!loading && (
        <>
          {active.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">Em andamento</h2>
              <div className="space-y-3">
                {active.map((t) => (
                  <TaskCard key={t.id} task={t} permissions={permissions} onStatusChange={changeStatus} onMarkRework={markRework} onRemoveRework={removeRework} onClick={() => setSelectedTask(t)} />
                ))}
              </div>
            </div>
          )}
          {completed.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">Concluídas</h2>
              <div className="space-y-3">
                {completed.map((t) => (
                  <TaskCard key={t.id} task={t} permissions={permissions} onStatusChange={changeStatus} onMarkRework={markRework} onRemoveRework={removeRework} onClick={() => setSelectedTask(t)} />
                ))}
              </div>
            </div>
          )}
          {tasks.length === 0 && <p className="text-sm text-gray-400 text-center py-12">Nenhuma tarefa de retrabalho</p>}
        </>
      )}
      {selectedTask && <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)} />}
    </div>
  );
}
