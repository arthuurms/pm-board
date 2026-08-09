import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.incident.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// Editable by whoever reported the incident, or an admin.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  const existing = await prisma.incident.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Incidente não encontrado" }, { status: 404 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const canEdit = existing.reportedById === userId || user?.role === "admin";
  if (!canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { title, description, category, severity, occurredAt, relatedUserId } = body;

  if (!title || !category || !severity || !occurredAt) {
    return NextResponse.json({ error: "title, category, severity, occurredAt são obrigatórios" }, { status: 400 });
  }

  const updated = await prisma.incident.update({
    where: { id },
    data: {
      title,
      description: description || null,
      category,
      severity,
      occurredAt: new Date(occurredAt),
      relatedUserId: relatedUserId || null,
    },
    include: { reportedBy: { select: { id: true, name: true } } },
  });

  return NextResponse.json(updated);
}
