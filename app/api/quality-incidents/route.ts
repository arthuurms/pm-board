import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { findQualityReason } from "@/lib/qualityIncidents";
import { notifyQualityIncident } from "@/lib/discord";

const INCLUDE = {
  targetUser: { select: { id: true, name: true } },
  reportedBy: { select: { id: true, name: true } },
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const allowed = await hasPermission(userId, "manage_quality_incidents");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const targetUserId = searchParams.get("userId");

  const where: Record<string, unknown> = {};
  if (targetUserId) where.targetUserId = targetUserId;

  if (month) {
    const [y, m] = month.split("-").map(Number);
    where.createdAt = {
      gte: new Date(y, m - 1, 1),
      lt: new Date(y, m, 1),
    };
  }

  const incidents = await prisma.qualityIncident.findMany({
    where,
    include: INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(incidents);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const allowed = await hasPermission(userId, "manage_quality_incidents");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { targetUserId, reasonKey, description, proofUrl, proofName } = body;

  if (!targetUserId || !reasonKey || !description) {
    return NextResponse.json({ error: "targetUserId, reasonKey e description são obrigatórios" }, { status: 400 });
  }

  const reason = findQualityReason(reasonKey);
  if (!reason) return NextResponse.json({ error: "Motivo inválido" }, { status: 400 });

  const incident = await prisma.qualityIncident.create({
    data: {
      targetUserId,
      reasonKey: reason.key,
      reasonLabel: reason.label,
      points: reason.points,
      description,
      proofUrl: proofUrl || null,
      proofName: proofName || null,
      reportedById: userId,
    },
    include: INCLUDE,
  });

  await notifyQualityIncident({
    targetUserName: incident.targetUser.name,
    reasonLabel: incident.reasonLabel,
    points: incident.points,
    description: incident.description,
    proofUrl: incident.proofUrl,
    reportedByName: incident.reportedBy.name,
    createdAt: incident.createdAt,
  });

  return NextResponse.json(incident, { status: 201 });
}
