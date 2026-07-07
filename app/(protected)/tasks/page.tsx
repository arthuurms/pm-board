"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Task, User } from "@/types";
import TaskBoard from "@/components/tasks/TaskBoard";
import TaskCard from "@/components/tasks/TaskCard";
import TaskDetail from "@/components/tasks/TaskDetail";
import TaskForm from "@/components/tasks/TaskForm";
import { Plus, LayoutGrid, List } from "lucide-react";

type ViewMode = "board" | "list";

export default function TasksPage() {
  const { data: session } = useSession();
  const currentUser = session?.user as { id?: string; role?: string; name?: string } | undefined;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<ViewMode>("board");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showForm, setShowForm] = useState(false);
  // Admin can filter by person; collaborators see only their own tasks
  const [filterUser, setFilterUser] = useState<string>("");
  const [filterPriority, setFilterPriority] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then(setUsers);
  }, []);

  useEffect(() => {
    if (!currentUser?.id) return;
    fetch(`/api/users/${currentUser.id}/permissions`).then((r) => r.json()).then(setPermissions);
  }, [currentUser?.id]);

  const isAdmin = currentUser?.role === "admin";

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    const params = new URLSearchParams();

    // Collaborators always see only their own tasks
    // Admins can filter by a selected person, defaulting to all
    if (!isAdmin) {
      params.set("assigneeId", currentUser.id);
    } else if (filterUser) {
      params.set("assigneeId", filterUser);
    }

    if (filterPriority) params.set("priority", filterPriority);

    const res = await fetch(`/api/tasks?${params}`);
    setTasks(await res.json());
    setLoading(false);
  }, [currentUser?.id, isAdmin, filterUser, filterPriority]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(taskId: string, newStatus: string) {
    await fetch(`/api/tasks/${taskId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    // Optimistically update, then refetch to get server fields (onTime, completedAt)
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: newStatus as Task["status"] } : t));
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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tarefas Ativas</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin ? "Visão geral da equipe" : `Suas tarefas, ${currentUser?.name?.split(" ")[0]}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("board")}
            className={`p-2 rounded-lg transition-colors ${view === "board" ? "bg-violet-100 text-violet-700" : "text-gray-400 hover:bg-gray-100"}`}
            title="Board Kanban"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView("list")}
            className={`p-2 rounded-lg transition-colors ${view === "list" ? "bg-violet-100 text-violet-700" : "text-gray-400 hover:bg-gray-100"}`}
            title="Lista"
          >
            <List className="w-4 h-4" />
          </button>
          {permissions.create_task && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Nova Tarefa
            </button>
          )}
        </div>
      </div>

      {/* Filters — admin only sees person filter */}
      <div className="flex flex-wrap gap-3 mb-5">
        {isAdmin && (
          <select
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
          >
            <option value="">Todos os responsáveis</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <select
          className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
        >
          <option value="">Todas as prioridades</option>
          <option value="low">Baixa</option>
          <option value="medium">Média</option>
          <option value="high">Alta</option>
          <option value="urgent">Urgente</option>
        </select>
      </div>

      {loading && <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>}

      {!loading && view === "board" && (
        <TaskBoard
          tasks={tasks}
          permissions={permissions}
          onStatusChange={changeStatus}
          onMarkRework={markRework} onRemoveRework={removeRework}
          onTaskClick={setSelectedTask}
        />
      )}

      {!loading && view === "list" && (
        <div className="space-y-3">
          {tasks.length === 0 && <p className="text-sm text-gray-400 text-center py-12">Nenhuma tarefa ativa</p>}
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              permissions={permissions}
              onStatusChange={changeStatus}
              onMarkRework={markRework} onRemoveRework={removeRework}
              onClick={() => setSelectedTask(t)}
            />
          ))}
        </div>
      )}

      {selectedTask && (
        <TaskDetail task={selectedTask} onClose={() => { setSelectedTask(null); load(); }} />
      )}
      {showForm && (
        <TaskForm users={users} onCreated={load} onClose={() => setShowForm(false)} />
      )}
    </div>
  );
}
