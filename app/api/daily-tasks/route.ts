import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const INCLUDE = {
  assignee: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true } },
  completions: true,
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const assigneeId = searchParams.get("assigneeId");

  const tasks = await prisma.dailyTask.findMany({
    where: {
      active: true,
      ...(assigneeId ? { assigneeId } : {}),
    },
    include: INCLUDE,
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const creatorId = (session.user as { id: string }).id;
  const { title, description, priority, assigneeId } = await req.json();

  if (!title || !assigneeId) {
    return NextResponse.json({ error: "title e assigneeId obrigatórios" }, { status: 400 });
  }

  const task = await prisma.dailyTask.create({
    data: { title, description, priority: priority || "medium", assigneeId, creatorId },
    include: INCLUDE,
  });

  return NextResponse.json(task, { status: 201 });
}
