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
  const userId = (session.user as { id: string }).id;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const assigneeIdParam = searchParams.get("assigneeId");
  const priority = searchParams.get("priority");
  const isRework = searchParams.get("isRework");
  const month = searchParams.get("month"); // YYYY-MM

  const requester = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  const isAdmin = requester?.role === "admin";
  const canViewAll = isAdmin || (await hasPermission(userId, "view_all_tasks"));

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (isRework !== null) where.isRework = isRework === "true";

  if (!canViewAll) {
    // Regular collaborators only ever see their own tasks — the assigneeId
    // param is ignored so they can't request someone else's.
    where.assigneeId = userId;
  } else {
    if (assigneeIdParam) where.assigneeId = assigneeIdParam;
    if (!isAdmin) {
      // Granted "view all" without being an admin: everyone except admins.
      where.assignee = { role: { not: "admin" } };
    }
  }

  if (month) {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);
    where.completedAt = { gte: start, lt: end };
  }

  const tasks = await prisma.task.findMany({
    where,
    include: INCLUDE,
    orderBy: { dueDate: "asc" },
  });

  // Priority is a plain string field, so sorting it alphabetically ("desc")
  // doesn't match real urgency (e.g. "high" sorts after "medium"). Rank
  // explicitly instead: Urgente, Alta, Média, Baixa.
  const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  tasks.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99));

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
