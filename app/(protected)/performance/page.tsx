"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { ReworkSLAChart, IncidentsChart } from "@/components/dashboard/TrendChart";
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  RotateCcw, Clock, Target, Award, Zap, ThumbsDown,
} from "lucide-react";
import clsx from "clsx";

interface PerformanceData {
  user: { id: string; name: string; email: string; position?: string | null; role: string };
  period: { months: number; start: string; end: string };
  summary: {
    totalCompleted: number;
    reworkCount: number;
    onTimeCount: number;
    lateCount: number;
    reworkRate: number;
    slaRate: number;
    incidentCount: number;
    avgResolutionHours: number | null;
  };
  classification: "boa" | "media" | "baixa";
  classLabel: string;
  classColor: string;
  classReason: string;
  byPriority: Record<string, number>;
  incidentsBySeverity: Record<string, number>;
  strengths: string[];
  improvements: string[];
  trend: Array<{ month: string; label: string; reworkRate: number; slaRate: number; incidents: number; total: number }>;
}

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente",
};
const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-200", medium: "bg-blue-300", high: "bg-orange-400", urgent: "bg-red-500",
};
const SEV_LABELS: Record<string, string> = {
  low: "Baixa", medium: "Média", high: "Alta", critical: "Crítica",
};
const CLASS_STYLES = {
  boa:   { bg: "bg-green-50 border-green-300",  badge: "bg-green-100 text-green-800",  icon: Award,     iconColor: "text-green-600" },
  media: { bg: "bg-yellow-50 border-yellow-300", badge: "bg-yellow-100 text-yellow-800", icon: Target,   iconColor: "text-yellow-600" },
  baixa: { bg: "bg-red-50 border-red-300",       badge: "bg-red-100 text-red-800",       icon: ThumbsDown, iconColor: "text-red-600" },
};

function StatCard({ label, value, sub, icon, color }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; color: string }) {
  return (
    <div className={clsx("rounded-xl border p-4 shadow-sm", color)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className="text-gray-300">{icon}</div>
      </div>
    </div>
  );
}

export default function PerformancePage() {
  const { data: session } = useSession();
  const currentUser = session?.user as { id?: string; role?: string } | undefined;
  const isAdmin = currentUser?.role === "admin";

  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [months, setMonths] = useState(3);
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then((list) => {
      setUsers(list);
      // Default: own profile for collaborators, first user for admin
      if (!isAdmin && currentUser?.id) setSelectedUserId(currentUser.id);
      else if (list.length > 0) setSelectedUserId(list[0].id);
    });
  }, [isAdmin, currentUser?.id]);

  const load = useCallback(async () => {
    if (!selectedUserId) return;
    setLoading(true);
    const res = await fetch(`/api/performance?userId=${selectedUserId}&months=${months}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [selectedUserId, months]);

  useEffect(() => { load(); }, [load]);

  const cls = data ? CLASS_STYLES[data.classification] : null;
  const ClassIcon = cls?.icon;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Análise de Desempenho</h1>
        <p className="text-sm text-gray-500 mt-1">Indicadores de rendimento individuais e classificação de qualidade</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-6">
        {isAdmin && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Colaborador</label>
            <select
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Período</label>
          <select
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
          >
            <option value={1}>Último mês</option>
            <option value={3}>Últimos 3 meses</option>
            <option value={6}>Últimos 6 meses</option>
          </select>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-400 text-center py-16">Analisando desempenho...</p>}

      {!loading && data && cls && ClassIcon && (
        <div className="space-y-6">
          {/* Classification banner */}
          <div className={clsx("rounded-xl border-2 p-5 flex items-start gap-4", cls.bg)}>
            <ClassIcon className={clsx("w-10 h-10 shrink-0 mt-0.5", cls.iconColor)} />
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-lg font-bold text-gray-900">{data.user.name}</p>
                <span className={clsx("px-3 py-1 rounded-full text-sm font-semibold", cls.badge)}>
                  {data.classLabel}
                </span>
              </div>
              {data.user.position && <p className="text-sm text-gray-500 mt-0.5">{data.user.position}</p>}
              <p className="text-sm text-gray-600 mt-2">{data.classReason}</p>
              <p className="text-xs text-gray-400 mt-1">
                Baseado em {data.summary.totalCompleted} tarefa(s) concluída(s) nos últimos {data.period.months} mês(es)
              </p>
            </div>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="SLA no Prazo"
              value={`${data.summary.slaRate}%`}
              sub={`${data.summary.onTimeCount} no prazo`}
              icon={<Clock className="w-7 h-7" />}
              color={data.summary.slaRate >= 85 ? "bg-green-50 border-green-200" : data.summary.slaRate >= 65 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200"}
            />
            <StatCard
              label="Taxa Retrabalho"
              value={`${data.summary.reworkRate}%`}
              sub={`${data.summary.reworkCount} de ${data.summary.totalCompleted}`}
              icon={<RotateCcw className="w-7 h-7" />}
              color={data.summary.reworkRate <= 10 ? "bg-green-50 border-green-200" : data.summary.reworkRate <= 25 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200"}
            />
            <StatCard
              label="Incidentes"
              value={data.summary.incidentCount}
              sub="no período"
              icon={<AlertTriangle className="w-7 h-7" />}
              color={data.summary.incidentCount === 0 ? "bg-green-50 border-green-200" : data.summary.incidentCount <= 2 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200"}
            />
            <StatCard
              label="Tempo Médio"
              value={data.summary.avgResolutionHours !== null ? `${data.summary.avgResolutionHours}h` : "—"}
              sub="início → conclusão"
              icon={<Zap className="w-7 h-7" />}
              color="bg-white border-gray-200"
            />
          </div>

          {/* Strengths & improvements */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <p className="text-sm font-semibold text-green-800">Pontos fortes</p>
              </div>
              {data.strengths.length === 0
                ? <p className="text-xs text-green-600">Dados insuficientes no período</p>
                : (
                  <ul className="space-y-1.5">
                    {data.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-green-700">
                        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-green-500" />
                        {s}
                      </li>
                    ))}
                  </ul>
                )}
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="w-4 h-4 text-orange-600" />
                <p className="text-sm font-semibold text-orange-800">Pontos de melhoria</p>
              </div>
              {data.improvements.length === 0
                ? <p className="text-xs text-orange-600">Nenhum ponto de atenção identificado!</p>
                : (
                  <ul className="space-y-1.5">
                    {data.improvements.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-orange-700">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-orange-400" />
                        {s}
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          </div>

          {/* Priority distribution */}
          {Object.keys(data.byPriority).length > 0 && (
            <div className="bg-white rounded-xl border p-5 shadow-sm">
              <p className="text-sm font-semibold text-gray-700 mb-4">Distribuição por Prioridade (tarefas concluídas)</p>
              <div className="space-y-2">
                {["urgent", "high", "medium", "low"].map((p) => {
                  const count = data.byPriority[p] || 0;
                  const pct = data.summary.totalCompleted > 0 ? Math.round((count / data.summary.totalCompleted) * 100) : 0;
                  return count > 0 ? (
                    <div key={p} className="flex items-center gap-3">
                      <span className="w-16 text-xs text-gray-500 text-right shrink-0">{PRIORITY_LABELS[p]}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-3">
                        <div className={clsx("h-3 rounded-full", PRIORITY_COLORS[p])} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-600 w-12 shrink-0">{count} ({pct}%)</span>
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          )}

          {/* Incidents by severity */}
          {Object.keys(data.incidentsBySeverity).length > 0 && (
            <div className="bg-white rounded-xl border p-5 shadow-sm">
              <p className="text-sm font-semibold text-gray-700 mb-3">Incidentes por Severidade</p>
              <div className="flex flex-wrap gap-3">
                {Object.entries(data.incidentsBySeverity).map(([sev, count]) => (
                  <div key={sev} className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-4 py-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="text-sm text-gray-600">{SEV_LABELS[sev] || sev}</span>
                    <span className="text-sm font-bold text-red-700">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trend charts */}
          {data.trend.length > 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ReworkSLAChart data={data.trend} />
              <IncidentsChart data={data.trend} />
            </div>
          )}

          {/* Stats summary row */}
          <div className="bg-slate-50 border rounded-xl p-5">
            <p className="text-sm font-semibold text-gray-700 mb-3">Resumo do período ({data.period.months} meses)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900">{data.summary.totalCompleted}</p>
                <p className="text-xs text-gray-400 mt-0.5">Tarefas entregues</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{data.summary.onTimeCount}</p>
                <p className="text-xs text-gray-400 mt-0.5">No prazo</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{data.summary.lateCount}</p>
                <p className="text-xs text-gray-400 mt-0.5">Fora do prazo</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-500">{data.summary.reworkCount}</p>
                <p className="text-xs text-gray-400 mt-0.5">Retrabalhos</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && !data && selectedUserId && (
        <div className="text-center py-16 text-gray-400">
          <Target className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhum dado encontrado para este usuário no período selecionado</p>
        </div>
      )}
    </div>
  );
}
