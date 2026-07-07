import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";

const INCLUDE = {
  reportedBy: { select: { id: true, name: true } },
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const relatedUserId = searchParams.get("userId");

  const where: Record<string, unknown> = {};
  if (relatedUserId) where.relatedUserId = relatedUserId;

  if (month) {
    const [y, m] = month.split("-").map(Number);
    where.occurredAt = {
      gte: new Date(y, m - 1, 1),
      lt: new Date(y, m, 1),
    };
  }

  const incidents = await prisma.incident.findMany({
    where,
    include: INCLUDE,
    orderBy: { occurredAt: "desc" },
  });

  return NextResponse.json(incidents);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const allowed = await hasPermission(userId, "create_incident");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { title, description, category, severity, occurredAt, relatedUserId } = body;

  if (!title || !category || !severity || !occurredAt) {
    return NextResponse.json({ error: "title, category, severity, occurredAt são obrigatórios" }, { status: 400 });
  }

  const incident = await prisma.incident.create({
    data: {
      title,
      description,
      category,
      severity,
      occurredAt: new Date(occurredAt),
      reportedById: userId,
      relatedUserId: relatedUserId || null,
    },
    include: INCLUDE,
  });

  return NextResponse.json(incident, { status: 201 });
}
