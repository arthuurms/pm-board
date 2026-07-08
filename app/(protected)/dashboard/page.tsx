"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import MetricCard from "@/components/dashboard/MetricCard";
import { ReworkSLAChart, IncidentsChart } from "@/components/dashboard/TrendChart";
import { AlertTriangle, RotateCcw, Clock, CheckCircle, CalendarCheck, Check } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";

interface Metrics {
  month: string;
  incidentCount: number;
  incidentsByCategory: Record<string, number>;
  reworkRate: number;
  slaRate: number;
  totalCompleted: number;
  totalRework: number;
  onTimeCount: number;
  trend: Array<{ month: string; label: string; reworkRate: number; slaRate: number; incidents: number; total: number }>;
}

interface DailyTask {
  id: string;
  title: string;
  priority: string;
  completions: { date: string }[];
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const CATEGORY_LABELS: Record<string, string> = {
  ops_down: "Operação fora do ar",
  service_failure: "Falha de atendimento",
  revenue_loss: "Perda de venda/dado",
};

export default function DashboardPage() {
  const { data: session } = useSession();
  const currentUser = session?.user as { id?: string; role?: string; name?: string } | undefined;
  const isAdmin = currentUser?.role === "admin";
  const today = todayStr();

  const [month, setMonth] = useState(currentMonth());
  const [userId, setUserId] = useState<string>("");
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [dailyLoading, setDailyLoading] = useState(true);

  useEffect(() => {
    if (currentUser?.id) setUserId(currentUser.id);
  }, [currentUser?.id]);

  useEffect(() => {
    if (isAdmin) fetch("/api/users").then((r) => r.json()).then(setUsers);
  }, [isAdmin]);

  const load = useCallback(async () => {
    if (!userId && !isAdmin) return;
    setLoading(true);
    const params = new URLSearchParams({ month });
    if (userId) params.set("userId", userId);
    const res = await fetch(`/api/metrics?${params}`);
    setMetrics(await res.json());
    setLoading(false);
  }, [month, userId, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const loadDaily = useCallback(async () => {
    if (!currentUser?.id) return;
    setDailyLoading(true);
    // This widget is a personal daily routine checklist — always scoped to the
    // logged-in user, even for admins (the dedicated /daily-tasks page has the
    // admin-wide grouped view).
    const params = new URLSearchParams({ assigneeId: currentUser.id });
    const res = await fetch(`/api/daily-tasks?${params}`);
    setDailyTasks(await res.json());
    setDailyLoading(false);
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

  const selectedUserName = userId
    ? (users.find((u) => u.id === userId)?.name ?? currentUser?.name ?? "Você")
    : "Toda a equipe";

  const slaColor = metrics ? (metrics.slaRate >= 80 ? "green" : metrics.slaRate >= 60 ? "orange" : "red") : "default";
  const reworkColor = metrics ? (metrics.reworkRate <= 10 ? "green" : metrics.reworkRate <= 25 ? "orange" : "red") : "default";

  const completedToday = dailyTasks.filter((t) => t.completions.some((c) => c.date === today)).length;
  const totalDaily = dailyTasks.length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard de Qualidade</h1>
        <p className="text-sm text-gray-500 mt-1">
          Métricas de <span className="font-medium text-violet-600">{selectedUserName}</span>
        </p>
      </div>

      {/* Daily tasks widget */}
      {totalDaily > 0 && (
        <div className="mb-6 bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b bg-violet-50">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-semibold text-violet-800">Rotina de Hoje</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-violet-600 font-medium">{completedToday}/{totalDaily} feitas</span>
              <div className="w-24 bg-violet-100 rounded-full h-1.5">
                <div
                  className={clsx("h-1.5 rounded-full transition-all", completedToday === totalDaily ? "bg-green-500" : "bg-violet-500")}
                  style={{ width: `${(completedToday / totalDaily) * 100}%` }}
                />
              </div>
              <Link href="/daily-tasks" className="text-xs text-violet-500 hover:text-violet-700">Ver todas →</Link>
            </div>
          </div>
          {dailyLoading ? (
            <p className="text-xs text-gray-400 text-center py-4">Carregando...</p>
          ) : (
            <div className="divide-y">
              {dailyTasks.map((task) => {
                const done = task.completions.some((c) => c.date === today);
                return (
                  <div key={task.id} className={clsx("flex items-center gap-3 px-5 py-3 transition-colors", done && "bg-green-50")}>
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
          )}
        </div>
      )}

      {totalDaily === 0 && !dailyLoading && (
        <Link href="/daily-tasks" className="mb-6 flex items-center gap-3 bg-violet-50 border border-violet-100 rounded-xl px-5 py-3 text-sm text-violet-600 hover:bg-violet-100 transition-colors">
          <CalendarCheck className="w-4 h-4" />
          Adicionar tarefas da rotina diária →
        </Link>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Mês</label>
          <input
            type="month"
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        {isAdmin && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Pessoa</label>
            <select
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">Toda a equipe</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {loading && <div className="text-sm text-gray-400 py-8 text-center">Calculando métricas...</div>}

      {metrics && !loading && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard
              label="Incidentes Críticos"
              value={metrics.incidentCount}
              subtitle={`${new Date(month + "-01").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`}
              color={metrics.incidentCount === 0 ? "green" : metrics.incidentCount <= 2 ? "orange" : "red"}
              icon={<AlertTriangle className="w-8 h-8" />}
            />
            <MetricCard
              label="Taxa de Retrabalho"
              value={`${metrics.reworkRate}%`}
              subtitle={`${metrics.totalRework} de ${metrics.totalCompleted} tarefas`}
              color={reworkColor as "default" | "green" | "red" | "orange"}
              icon={<RotateCcw className="w-8 h-8" />}
            />
            <MetricCard
              label="SLA no Prazo"
              value={`${metrics.slaRate}%`}
              subtitle={`${metrics.onTimeCount} de ${metrics.totalCompleted} tarefas`}
              color={slaColor as "default" | "green" | "red" | "orange"}
              icon={<Clock className="w-8 h-8" />}
            />
            <MetricCard
              label="Tarefas Concluídas"
              value={metrics.totalCompleted}
              subtitle="no mês"
              color="default"
              icon={<CheckCircle className="w-8 h-8" />}
            />
          </div>

          {metrics.incidentCount > 0 && (
            <div className="bg-white rounded-xl border p-5 mb-6 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Incidentes por Categoria</h3>
              <div className="flex flex-wrap gap-3">
                {Object.entries(metrics.incidentsByCategory).map(([cat, count]) => (
                  <div key={cat} className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-4 py-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-gray-700">{CATEGORY_LABELS[cat] || cat}</span>
                    <span className="text-sm font-bold text-red-700">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ReworkSLAChart data={metrics.trend} />
            <IncidentsChart data={metrics.trend} />
          </div>

          <div className="mt-6 bg-violet-50 border border-violet-100 rounded-xl p-5 text-xs text-violet-800 space-y-2">
            <p className="font-semibold text-sm text-violet-900">Como as métricas são calculadas</p>
            <p><strong>Taxa de Retrabalho:</strong> (tarefas marcadas como retrabalho concluídas no mês ÷ total concluído) × 100</p>
            <p><strong>SLA no Prazo:</strong> (tarefas concluídas com data de conclusão ≤ prazo ÷ total concluído) × 100</p>
            <p><strong>Incidentes Críticos:</strong> contagem de registros de incidentes com ocorrência dentro do mês selecionado</p>
          </div>
        </>
      )}
    </div>
  );
}
