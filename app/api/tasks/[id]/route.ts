import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const INCLUDE = {
  assignee: { select: { id: true, name: true, email: true } },
  creator: { select: { id: true, name: true } },
  statusHistory: {
    include: { changedBy: { select: { id: true, name: true } } },
    orderBy: { changedAt: "asc" as const },
  },
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id }, include: INCLUDE });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(task);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const task = await prisma.task.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.dueDate !== undefined && { dueDate: new Date(body.dueDate) }),
      ...(body.assigneeId !== undefined && { assigneeId: body.assigneeId }),
      ...(body.isRework !== undefined && { isRework: body.isRework }),
      ...(body.originalTaskId !== undefined && { originalTaskId: body.originalTaskId }),
    },
    include: INCLUDE,
  });

  return NextResponse.json(task);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string; role: string }).id;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
