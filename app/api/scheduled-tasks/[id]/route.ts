import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { isValidTimeOfDay } from "@/lib/scheduleFormat";

const INCLUDE = {
  assignee: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true } },
  tag: true,
};

const PRIORITIES = ["low", "medium", "high", "urgent"];

async function authorize() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const userId = (session.user as { id: string }).id;
  if (!(await hasPermission(userId, "create_task"))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { userId };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.title !== undefined) {
    if (!body.title) return NextResponse.json({ error: "title não pode ser vazio" }, { status: 400 });
    data.title = body.title;
  }
  if (body.description !== undefined) data.description = body.description || null;
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority)) return NextResponse.json({ error: "priority inválida" }, { status: 400 });
    data.priority = body.priority;
  }
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId;
  if (body.tagId !== undefined) data.tagId = body.tagId || null;
  if (body.active !== undefined) data.active = Boolean(body.active);
  if (body.timeOfDay !== undefined) {
    if (!isValidTimeOfDay(body.timeOfDay)) {
      return NextResponse.json({ error: "timeOfDay deve estar no formato HH:mm" }, { status: 400 });
    }
    data.timeOfDay = body.timeOfDay;
  }
  if (body.daysOfWeek !== undefined) {
    const days = body.daysOfWeek;
    if (!Array.isArray(days) || days.length === 0 || days.some((d: number) => !Number.isInteger(d) || d < 0 || d > 6)) {
      return NextResponse.json({ error: "daysOfWeek deve ter números de 0 (domingo) a 6 (sábado)" }, { status: 400 });
    }
    data.daysOfWeek = [...new Set<number>(days)].sort((a, b) => a - b);
  }
  if (body.dueInHours !== undefined) {
    const due = Number(body.dueInHours);
    if (!Number.isInteger(due) || due < 1 || due > 24 * 30) {
      return NextResponse.json({ error: "dueInHours deve ser um inteiro entre 1 e 720" }, { status: 400 });
    }
    data.dueInHours = due;
  }

  const existing = await prisma.scheduledTask.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Tarefa programada não encontrada" }, { status: 404 });

  const updated = await prisma.scheduledTask.update({ where: { id }, data, include: INCLUDE });
  return NextResponse.json(updated);
}

// Already-generated tasks stay (their scheduledTaskId just becomes null); only future ones stop.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize();
  if (auth.error) return auth.error;

  const { id } = await params;
  const existing = await prisma.scheduledTask.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Tarefa programada não encontrada" }, { status: 404 });

  await prisma.scheduledTask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
