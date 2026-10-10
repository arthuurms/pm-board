"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Task, User } from "@/types";
import TaskBoard from "@/components/tasks/TaskBoard";
import TaskCard from "@/components/tasks/TaskCard";
import TaskDetail from "@/components/tasks/TaskDetail";
import TaskForm from "@/components/tasks/TaskForm";
import { Plus, LayoutGrid, List, CalendarCheck, Check, ChevronRight } from "lucide-react";
import { addDays, dayKeyOf, formatDayLong, mondayOf, relativeLabel, todayKey, weeksBetween } from "@/lib/dayKey";
import DayFilter, { DayMode } from "@/components/tasks/DayFilter";
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

const PRIORITY_RANK: Record<string, number> = { urgent: 3, high: 2, medium: 1, low: 0 };

// Open tasks past their deadline come first (most overdue first, then original priority);
// everything else keeps the API order (by due date, completed by latest finish).
function sortLateFirst(list: Task[]): Task[] {
  const now = Date.now();
  const group = (t: Task) => (t.status === "completed" ? 2 : new Date(t.dueDate).getTime() < now ? 0 : 1);
  return [...list].sort((a, b) => {
    const ga = group(a), gb = group(b);
    if (ga !== gb) return ga - gb;
    if (ga === 0) {
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime() || (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0);
    }
    return 0;
  });
}

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

  // Restore the last person filter so it survives a page reload.
  useEffect(() => {
    const saved = localStorage.getItem("clickfy:tasks:filterUser");
    if (saved) setFilterUser(saved);
  }, []);

  useEffect(() => {
    if (filterUser) localStorage.setItem("clickfy:tasks:filterUser", filterUser);
    else localStorage.removeItem("clickfy:tasks:filterUser");
  }, [filterUser]);

  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then(setUsers);
  }, []);

  useEffect(() => {
    if (!currentUser?.id) return;
    fetch(`/api/users/${currentUser.id}/permissions`).then((r) => r.json()).then(setPermissions);
  }, [currentUser?.id]);

  const isAdmin = currentUser?.role === "admin";
  const canViewAll = isAdmin || permissions.view_all_tasks;
  const canManageAll = isAdmin || permissions.manage_all_tasks;

  // `silent` skips the loading-spinner state, used for the background
  // auto-refresh so it doesn't unmount the task list (and any dialog open
  // inside a card, e.g. the rework-reason form) while someone is mid-edit.
  // Person, priority and day filters are applied client-side so the person
  // pills and the calendar counts can be computed from the same data.
  const load = useCallback(async (silent = false) => {
    if (!currentUser?.id) return;
    if (!silent) setLoading(true);
    const res = await fetch("/api/tasks");
    const data = await res.json();
    setTasks(data);
    if (!silent) setLoading(false);
  }, [currentUser?.id]);

  useEffect(() => { load(); }, [load]);

  // Calendar: null selection follows "today" (also after midnight); otherwise a
  // day key "YYYY-MM-DD", "overdue" or "all". weekOffset 0 = the current week.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const todayDay = todayKey();
  const activeDay = selectedDay ?? todayDay;
  const weekStart = addDays(mondayOf(todayDay), weekOffset * 7);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  function selectDay(key: string) {
    setSelectedDay(key === todayDay ? null : key);
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) setWeekOffset(weeksBetween(mondayOf(todayDay), mondayOf(key)));
  }

  function goToToday() {
    setSelectedDay(null);
    setWeekOffset(0);
  }

  // Tasks of the chosen person/priority (every date), then split by day.
  const scoped = useMemo(
    () => tasks.filter((t) => (!filterUser || t.assigneeId === filterUser) && (!filterPriority || t.priority === filterPriority)),
    [tasks, filterUser, filterPriority]
  );

  const byDay = useMemo(() => {
    const map: Record<string, { total: number; done: number }> = {};
    for (const t of scoped) {
      const k = dayKeyOf(t.dueDate);
      const e = (map[k] ??= { total: 0, done: 0 });
      e.total++;
      if (t.status === "completed") e.done++;
    }
    return map;
  }, [scoped]);

  // An open task whose due day is before today never stays behind: it follows the person into "today".
  const carriedOver = useMemo(
    () => scoped.filter((t) => t.status !== "completed" && dayKeyOf(t.dueDate) < todayDay),
    [scoped, todayDay]
  );

  const overdueCount = carriedOver.length;

  const visibleTasks = useMemo(() => {
    let list: Task[];
    if (activeDay === "all") list = scoped;
    else if (activeDay === "overdue") list = carriedOver;
    else {
      list = scoped.filter((t) => dayKeyOf(t.dueDate) === activeDay);
      if (activeDay === todayDay) list = [...carriedOver, ...list];
    }
    return sortLateFirst(list);
  }, [scoped, carriedOver, activeDay, todayDay]);

  const countByUser = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of tasks) m[t.assigneeId] = (m[t.assigneeId] ?? 0) + 1;
    return m;
  }, [tasks]);

  const totals = useMemo(() => {
    const count = (list: Task[]) => ({
      total: list.length,
      pending: list.filter((t) => t.status === "pending").length,
      in_progress: list.filter((t) => t.status === "in_progress").length,
      completed: list.filter((t) => t.status === "completed").length,
    });
    return { all: count(scoped), day: count(visibleTasks) };
  }, [scoped, visibleTasks]);

  function personPill(value: string, label: string, count: number) {
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

  const mode: DayMode = activeDay === "all" ? "all" : activeDay === "overdue" ? "overdue" : "day";
  const dayTitle =
    mode === "all" ? "Todas as tarefas"
    : mode === "overdue" ? "Tarefas atrasadas"
    : (relativeLabel(activeDay, todayDay) ? relativeLabel(activeDay, todayDay) + " · " : "") + formatDayLong(activeDay);

  // Auto-refresh so tasks created/updated elsewhere (e.g. by another person,
  // or via the MCP integration) show up without a manual page reload.
  useEffect(() => {
    const interval = setInterval(() => load(true), 15000);
    return () => clearInterval(interval);
  }, [load]);

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

  async function markRework(taskId: string, reason: string) {
    await fetch(`/api/tasks/${taskId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addRework: true, reworkReason: reason }),
    });
    load();
  }

  async function editReworkReason(taskId: string, reason: string) {
    await fetch(`/api/tasks/${taskId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updateReworkReason: reason }),
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
            {canViewAll ? "Visão geral da equipe" : `Suas tarefas, ${currentUser?.name?.split(" ")[0]}`}
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

      {/* Who + priority */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {canViewAll && (
          <>
            {personPill("", "Todos", tasks.length)}
            {users.map((u) => personPill(u.id, u.name, countByUser[u.id] ?? 0))}
          </>
        )}
        <select
          className="ml-auto border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
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

      {/* When: Por dia / Atrasadas / Todas */}
      <DayFilter
        mode={mode}
        activeDay={activeDay}
        todayDay={todayDay}
        weekDays={weekDays}
        byDay={byDay}
        overdueCount={overdueCount}
        allCount={scoped.length}
        showBackToToday={selectedDay !== null || weekOffset !== 0}
        onPickDay={selectDay}
        onPickOverdue={() => setSelectedDay("overdue")}
        onPickAll={() => setSelectedDay("all")}
        onWeek={(d) => setWeekOffset((w) => w + d)}
        onBackToToday={goToToday}
      />

      {/* What the board below is showing */}
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">{dayTitle}</h2>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="text-sm text-gray-500">{totals.day.total} tarefa{totals.day.total === 1 ? "" : "s"}:</span>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">{totals.day.pending} pendente{totals.day.pending === 1 ? "" : "s"}</span>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">{totals.day.in_progress} em andamento</span>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">{totals.day.completed} concluída{totals.day.completed === 1 ? "" : "s"}</span>
        </div>
        {mode === "day" && activeDay === todayDay && carriedOver.length > 0 && (
          <p className="text-xs font-semibold text-red-600 mt-2">
            Inclui {carriedOver.length} tarefa{carriedOver.length === 1 ? "" : "s"} atrasada{carriedOver.length === 1 ? "" : "s"} de dias anteriores, no topo, com prioridade máxima.
          </p>
        )}
        {mode !== "all" && (
          <p className="text-xs text-gray-400 mt-2">
            Total geral{filterUser ? " da pessoa" : ""}: {totals.all.total} tarefas · {totals.all.pending} pendentes · {totals.all.in_progress} em andamento · {totals.all.completed} concluídas
          </p>
        )}
      </div>


      {loading && <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>}

      {!loading && visibleTasks.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4 mb-3 border border-dashed border-gray-200 rounded-xl">
          Nenhuma tarefa {activeDay === "all" ? "encontrada" : activeDay === "overdue" ? "atrasada" : "para este dia"}.
        </p>
      )}

      {!loading && view === "board" && (
        <TaskBoard
          tasks={visibleTasks}
          permissions={permissions}
          onStatusChange={changeStatus}
          onMarkRework={markRework}
          onEditReworkReason={editReworkReason}
          onRemoveRework={removeRework}
          onApprove={approveTask}
          currentUserId={currentUser?.id}
          isAdmin={isAdmin}
          onTaskClick={setSelectedTask}
          onEdit={setEditTask}
          onDelete={canManageAll ? deleteTask : undefined}
        />
      )}

      {!loading && view === "list" && (
        <div className="space-y-3">
          {visibleTasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              permissions={permissions}
              onStatusChange={changeStatus}
              onMarkRework={markRework}
          onEditReworkReason={editReworkReason}
              onRemoveRework={removeRework}
              onApprove={approveTask}
              currentUserId={currentUser?.id}
              isAdmin={isAdmin}
              onEdit={setEditTask}
              onDelete={canManageAll ? deleteTask : undefined}
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
