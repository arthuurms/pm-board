import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/performance?userId=...&months=6
 *
 * Returns a full performance analysis for a given user over the last N months.
 *
 * Classification logic:
 *   BOA QUALIDADE  (green):  slaRate >= 85 AND reworkRate <= 10 AND incidents <= 1
 *   QUALIDADE MÉDIA (yellow): slaRate >= 65 AND reworkRate <= 25 AND incidents <= 3
 *   BAIXA QUALIDADE (red):   anything below the above thresholds
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const months = parseInt(searchParams.get("months") || "3", 10);

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const windowEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // Fetch all data in the window
  const [allTasks, allIncidents, user] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeId: userId, completedAt: { gte: windowStart, lt: windowEnd }, status: "completed" },
      select: { isRework: true, onTime: true, completedAt: true, dueDate: true, startedAt: true, priority: true },
    }),
    prisma.incident.findMany({
      where: { relatedUserId: userId, occurredAt: { gte: windowStart, lt: windowEnd } },
      select: { category: true, severity: true, occurredAt: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, position: true, role: true },
    }),
  ]);

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // --- Aggregate metrics ---
  const total = allTasks.length;
  const reworkCount = allTasks.filter((t) => t.isRework).length;
  const onTimeCount = allTasks.filter((t) => t.onTime === true).length;
  const lateCount = allTasks.filter((t) => t.onTime === false).length;

  const reworkRate = total > 0 ? round((reworkCount / total) * 100) : 0;
  const slaRate = total > 0 ? round((onTimeCount / total) * 100) : 0;
  const incidentCount = allIncidents.length;

  // --- Classification ---
  let classification: "boa" | "media" | "baixa";
  let classLabel: string;
  let classColor: string;
  let classReason: string;

  if (slaRate >= 85 && reworkRate <= 10 && incidentCount <= 1) {
    classification = "boa";
    classLabel = "Boa Qualidade";
    classColor = "green";
    classReason = "SLA alto, baixo retrabalho e poucos incidentes";
  } else if (slaRate >= 65 && reworkRate <= 25 && incidentCount <= 3) {
    classification = "media";
    classLabel = "Qualidade Média";
    classColor = "yellow";
    classReason = "Há espaço para melhoria em prazo ou qualidade";
  } else {
    classification = "baixa";
    classLabel = "Baixa Qualidade";
    classColor = "red";
    classReason = buildLowReason(slaRate, reworkRate, incidentCount);
  }

  // --- Average resolution time (startedAt → completedAt) in hours ---
  const resolvedWithTimes = allTasks.filter((t) => t.startedAt && t.completedAt);
  const avgResolutionHours =
    resolvedWithTimes.length > 0
      ? round(
          resolvedWithTimes.reduce((sum, t) => {
            const ms = new Date(t.completedAt!).getTime() - new Date(t.startedAt!).getTime();
            return sum + ms / 3600000;
          }, 0) / resolvedWithTimes.length
        )
      : null;

  // --- Priority distribution of completed tasks ---
  const byPriority = allTasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.priority] = (acc[t.priority] || 0) + 1;
    return acc;
  }, {});

  // --- Incident breakdown ---
  const incidentsBySeverity = allIncidents.reduce<Record<string, number>>((acc, i) => {
    acc[i.severity] = (acc[i.severity] || 0) + 1;
    return acc;
  }, {});

  // --- Monthly trend for the window ---
  const trend = await buildTrend(userId, months);

  // --- Strengths and weaknesses ---
  const strengths: string[] = [];
  const improvements: string[] = [];

  if (slaRate >= 85) strengths.push(`Excelente cumprimento de prazo (${slaRate}%)`);
  else if (slaRate >= 65) improvements.push(`Melhorar entrega no prazo (atual: ${slaRate}%)`);
  else improvements.push(`SLA de prazo crítico — apenas ${slaRate}% das entregas no prazo`);

  if (reworkRate <= 10) strengths.push(`Baixíssima taxa de retrabalho (${reworkRate}%)`);
  else if (reworkRate <= 25) improvements.push(`Reduzir retrabalho (atual: ${reworkRate}%)`);
  else improvements.push(`Alta taxa de retrabalho (${reworkRate}%) — revisar processo de qualidade`);

  if (incidentCount === 0) strengths.push("Nenhum incidente crítico no período");
  else if (incidentCount <= 2) improvements.push(`${incidentCount} incidente(s) — monitorar recorrência`);
  else improvements.push(`${incidentCount} incidentes críticos — ação corretiva necessária`);

  if (avgResolutionHours !== null && avgResolutionHours < 24) strengths.push(`Tempo médio de resolução rápido (${avgResolutionHours}h)`);

  return NextResponse.json({
    user,
    period: { months, start: windowStart.toISOString(), end: windowEnd.toISOString() },
    summary: {
      totalCompleted: total,
      reworkCount,
      onTimeCount,
      lateCount,
      reworkRate,
      slaRate,
      incidentCount,
      avgResolutionHours,
    },
    classification,
    classLabel,
    classColor,
    classReason,
    byPriority,
    incidentsBySeverity,
    strengths,
    improvements,
    trend,
  });
}

function round(n: number) { return Math.round(n * 10) / 10; }

function buildLowReason(sla: number, rework: number, incidents: number): string {
  const issues = [];
  if (sla < 65) issues.push(`SLA baixo (${sla}%)`);
  if (rework > 25) issues.push(`retrabalho elevado (${rework}%)`);
  if (incidents > 3) issues.push(`muitos incidentes (${incidents})`);
  return issues.join(", ");
}

async function buildTrend(userId: string, months: number) {
  const now = new Date();
  const results = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    const [tasks, incidents] = await Promise.all([
      prisma.task.findMany({
        where: { assigneeId: userId, status: "completed", completedAt: { gte: start, lt: end } },
        select: { isRework: true, onTime: true },
      }),
      prisma.incident.count({ where: { relatedUserId: userId, occurredAt: { gte: start, lt: end } } }),
    ]);

    const total = tasks.length;
    const rework = tasks.filter((t) => t.isRework).length;
    const onTime = tasks.filter((t) => t.onTime === true).length;
    results.push({
      month,
      label,
      total,
      reworkRate: total > 0 ? round((rework / total) * 100) : 0,
      slaRate: total > 0 ? round((onTime / total) * 100) : 0,
      incidents,
    });
  }
  return results;
}
