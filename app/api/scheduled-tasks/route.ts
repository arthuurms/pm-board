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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  if (!(await hasPermission(userId, "create_task"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const schedules = await prisma.scheduledTask.findMany({ include: INCLUDE, orderBy: { createdAt: "desc" } });
  return NextResponse.json(schedules);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  if (!(await hasPermission(userId, "create_task"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { title, description, priority, assigneeId, tagId, timeOfDay, daysOfWeek, dueInHours } = await req.json();

  if (!title || !assigneeId || !timeOfDay) {
    return NextResponse.json({ error: "title, assigneeId e timeOfDay são obrigatórios" }, { status: 400 });
  }
  if (!isValidTimeOfDay(timeOfDay)) {
    return NextResponse.json({ error: "timeOfDay deve estar no formato HH:mm" }, { status: 400 });
  }
  if (priority && !PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: "priority inválida" }, { status: 400 });
  }
  const days: number[] = Array.isArray(daysOfWeek) ? daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
  if (days.length === 0 || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    return NextResponse.json({ error: "daysOfWeek deve ter números de 0 (domingo) a 6 (sábado)" }, { status: 400 });
  }
  const due = dueInHours === undefined ? 24 : Number(dueInHours);
  if (!Number.isInteger(due) || due < 1 || due > 24 * 30) {
    return NextResponse.json({ error: "dueInHours deve ser um inteiro entre 1 e 720" }, { status: 400 });
  }

  const schedule = await prisma.scheduledTask.create({
    data: {
      title,
      description: description || null,
      priority: priority || "medium",
      assigneeId,
      creatorId: userId,
      tagId: tagId || null,
      timeOfDay,
      daysOfWeek: [...new Set(days)].sort((a, b) => a - b),
      dueInHours: due,
    },
    include: INCLUDE,
  });

  return NextResponse.json(schedule, { status: 201 });
}
