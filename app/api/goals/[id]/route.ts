import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const INCLUDE = {
  assignee: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true } },
};

/**
 * PATCH /api/goals/[id]
 * body: { completed?: boolean, title?: string, description?: string, assigneeId?: string }
 * Toggling `completed` is allowed for the assignee themselves or an admin.
 * Editing title/description/assigneeId is admin-only.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  const goal = await prisma.goal.findUnique({ where: { id } });
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  const isAdmin = user?.role === "admin";
  const isAssignee = goal.assigneeId === userId;

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.completed !== undefined) {
    if (!isAdmin && !isAssignee) {
      return NextResponse.json({ error: "Apenas o responsável ou um admin pode marcar esta meta" }, { status: 403 });
    }
    data.completed = body.completed;
    data.completedAt = body.completed ? new Date() : null;
  }

  if (body.title !== undefined || body.description !== undefined || body.assigneeId !== undefined) {
    if (!isAdmin) return NextResponse.json({ error: "Apenas admins podem editar metas" }, { status: 403 });
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId;
  }

  const updated = await prisma.goal.update({ where: { id }, data, include: INCLUDE });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.goal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
