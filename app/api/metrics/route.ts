import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/metrics?month=YYYY-MM&userId=...
 *
 * Returns all three quality metrics for the specified month/user.
 *
 * METRIC 1 — Incidentes Críticos:
 *   Count of incidents in the period, grouped by category.
 *
 * METRIC 2 — Taxa de Retrabalho (%):
 *   (tasks with isRework=true completed in month) / (all tasks completed in month) * 100
 *
 * METRIC 3 — SLA de Entrega no Prazo (%):
 *   (tasks with onTime=true completed in month) / (all tasks completed in month) * 100
 *
 * Also returns 6-month trend data for charts.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get("month") || formatMonth(new Date());
  const userId = searchParams.get("userId") || undefined;

  const { start, end } = monthRange(monthParam);

  const taskWhere: Record<string, unknown> = {
    status: "completed",
    completedAt: { gte: start, lt: end },
  };
  if (userId) taskWhere.assigneeId = userId;

  const incidentWhere: Record<string, unknown> = {
    occurredAt: { gte: start, lt: end },
  };
  if (userId) incidentWhere.relatedUserId = userId;

  // --- Fetch data ---
  const [completedTasks, incidents] = await Promise.all([
    prisma.task.findMany({ where: taskWhere, select: { isRework: true, onTime: true } }),
    prisma.incident.findMany({ where: incidentWhere, select: { category: true } }),
  ]);

  const totalCompleted = completedTasks.length;
  const totalRework = completedTasks.filter((t) => t.isRework).length;
  const onTimeCount = completedTasks.filter((t) => t.onTime === true).length;

  const reworkRate = totalCompleted > 0 ? (totalRework / totalCompleted) * 100 : 0;
  const slaRate = totalCompleted > 0 ? (onTimeCount / totalCompleted) * 100 : 0;

  const incidentsByCategory = incidents.reduce<Record<string, number>>((acc, inc) => {
    acc[inc.category] = (acc[inc.category] || 0) + 1;
    return acc;
  }, {});

  // --- 6-month trend ---
  const trend = await computeTrend(6, userId);

  return NextResponse.json({
    month: monthParam,
    incidentCount: incidents.length,
    incidentsByCategory,
    reworkRate: round(reworkRate),
    slaRate: round(slaRate),
    totalCompleted,
    totalRework,
    onTimeCount,
    trend,
  });
}

// ---- helpers ----

function formatMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return {
    start: new Date(y, m - 1, 1),
    end: new Date(y, m, 1),
  };
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}

async function computeTrend(months: number, userId?: string) {
  const now = new Date();
  const results = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = formatMonth(d);
    const { start, end } = monthRange(month);

    const taskWhere: Record<string, unknown> = {
      status: "completed",
      completedAt: { gte: start, lt: end },
    };
    if (userId) taskWhere.assigneeId = userId;

    const incidentWhere: Record<string, unknown> = { occurredAt: { gte: start, lt: end } };
    if (userId) incidentWhere.relatedUserId = userId;

    const [tasks, incCount] = await Promise.all([
      prisma.task.findMany({ where: taskWhere, select: { isRework: true, onTime: true } }),
      prisma.incident.count({ where: incidentWhere }),
    ]);

    const total = tasks.length;
    const rework = tasks.filter((t) => t.isRework).length;
    const onTime = tasks.filter((t) => t.onTime === true).length;

    results.push({
      month,
      label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      reworkRate: total > 0 ? round((rework / total) * 100) : 0,
      slaRate: total > 0 ? round((onTime / total) * 100) : 0,
      incidents: incCount,
      total,
    });
  }

  return results;
}
