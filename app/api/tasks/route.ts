import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";

const INCLUDE = {
  assignee: { select: { id: true, name: true, email: true } },
  creator: { select: { id: true, name: true } },
  statusHistory: {
    include: { changedBy: { select: { id: true, name: true } } },
    orderBy: { changedAt: "asc" as const },
  },
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const assigneeId = searchParams.get("assigneeId");
  // Tasks where the user is either the assignee or the creator (used for a
  // user's own view, so they can see tasks they handed off to someone else).
  const involvingUserId = searchParams.get("involvingUserId");
  const priority = searchParams.get("priority");
  const isRework = searchParams.get("isRework");
  const month = searchParams.get("month"); // YYYY-MM

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (assigneeId) where.assigneeId = assigneeId;
  if (involvingUserId) where.OR = [{ assigneeId: involvingUserId }, { creatorId: involvingUserId }];
  if (priority) where.priority = priority;
  if (isRework !== null) where.isRework = isRework === "true";

  if (month) {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);
    where.completedAt = { gte: start, lt: end };
  }

  const tasks = await prisma.task.findMany({
    where,
    include: INCLUDE,
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
  });

  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const allowed = await hasPermission(userId, "create_task");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { title, description, priority, dueDate, assigneeId, attachmentUrl, attachmentName } = body;

  if (!title || !dueDate || !assigneeId) {
    return NextResponse.json({ error: "title, dueDate and assigneeId are required" }, { status: 400 });
  }

  const task = await prisma.task.create({
    data: {
      title,
      description,
      priority: priority || "medium",
      dueDate: new Date(dueDate),
      assigneeId,
      creatorId: userId,
      attachmentUrl: attachmentUrl || null,
      attachmentName: attachmentName || null,
    },
    include: INCLUDE,
  });

  await prisma.statusHistory.create({
    data: {
      taskId: task.id,
      fromStatus: null,
      toStatus: "pending",
      changedById: userId,
    },
  });

  return NextResponse.json(task, { status: 201 });
}
