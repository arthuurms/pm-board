"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Task, User } from "@/types";
import TaskBoard from "@/components/tasks/TaskBoard";
import TaskCard from "@/components/tasks/TaskCard";
import TaskDetail from "@/components/tasks/TaskDetail";
import TaskForm from "@/components/tasks/TaskForm";
import { Plus, LayoutGrid, List, CalendarCheck, Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";

interface DailyTask {
  id: string;
  title: string;
  completions: { date: string }[];
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type ViewMode = "board" | "list";

export default function TasksPage() {
  const { data: session } = useSession();
  const currentUser = session?.user as { id?: string; role?: string; name?: string } | undefined;
  const today = todayStr();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<ViewMode>("board");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [filterUser, setFilterUser] = useState<string>("");
  const [filterPriority, setFilterPriority] = useState("");
  const [loading, setLoading] = useState(true);
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);

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

    if (!isAdmin) {
      params.set("involvingUserId", currentUser.id);
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

  async function approveTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve: true }),
    });
    load();
  }

  async function deleteTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    load();
  }

  const loadDaily = useCallback(async () => {
    if (!currentUser?.id) return;
    // This widget is a personal daily routine checklist — always scoped to the
    // logged-in user, even for admins (the dedicated /daily-tasks page has the
    // admin-wide view with a filter).
    const params = new URLSearchParams({ assigneeId: currentUser.id });
    const res = await fetch(`/api/daily-tasks?${params}`);
    setDailyTasks(await res.json());
  }, [currentUser?.id]);

  useEffect(() => { loadDaily(); }, [loadDaily]);

  async function toggleDaily(taskId: string) {
    await fetch(`/api/daily-tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: today }),
    });
    loadDaily();
  }

  const dailyDone = dailyTasks.filter((t) => t.completions.some((c) => c.date === today)).length;
  const dailyTotal = dailyTasks.length;

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

      {/* Daily tasks widget */}
      {dailyTotal > 0 && (
        <div className="mb-5 bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b bg-violet-50">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-semibold text-violet-800">Rotina de Hoje</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-violet-600 font-medium">{dailyDone}/{dailyTotal}</span>
              <div className="w-24 bg-violet-100 rounded-full h-1.5">
                <div
                  className={clsx("h-1.5 rounded-full transition-all", dailyDone === dailyTotal ? "bg-green-500" : "bg-violet-500")}
                  style={{ width: `${(dailyDone / dailyTotal) * 100}%` }}
                />
              </div>
              <Link href="/daily-tasks" className="flex items-center gap-0.5 text-xs text-violet-500 hover:text-violet-700">
                Ver todas <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
          <div className="divide-y">
            {dailyTasks.map((task) => {
              const done = task.completions.some((c) => c.date === today);
              return (
                <div key={task.id} className={clsx("flex items-center gap-3 px-5 py-2.5 transition-colors", done && "bg-green-50")}>
                  <button
                    onClick={() => toggleDaily(task.id)}
                    className={clsx(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                      done ? "bg-green-500 border-green-500 text-white" : "border-gray-300 hover:border-violet-400"
                    )}
                  >
                    {done && <Check className="w-3 h-3" />}
                  </button>
                  <span className={clsx("text-sm flex-1", done ? "line-through text-gray-400" : "text-gray-800")}>
                    {task.title}
                  </span>
                  {done && <span className="text-xs text-green-600 font-medium">✓ Feito</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
          onMarkRework={markRework}
          onRemoveRework={removeRework}
          onApprove={approveTask}
          currentUserId={currentUser?.id}
          isAdmin={isAdmin}
          onTaskClick={setSelectedTask}
          onEdit={setEditTask}
          onDelete={isAdmin ? deleteTask : undefined}
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
              onMarkRework={markRework}
              onRemoveRework={removeRework}
              onApprove={approveTask}
              currentUserId={currentUser?.id}
              isAdmin={isAdmin}
              onEdit={setEditTask}
              onDelete={isAdmin ? deleteTask : undefined}
              onClick={() => setSelectedTask(t)}
            />
          ))}
        </div>
      )}

      {selectedTask && (
        <TaskDetail task={selectedTask} onClose={() => { setSelectedTask(null); load(); }} />
      )}
      {(showForm || editTask) && (
        <TaskForm
          users={users}
          onCreated={load}
          onClose={() => { setShowForm(false); setEditTask(null); }}
          editTask={editTask}
        />
      )}
    </div>
  );
}
