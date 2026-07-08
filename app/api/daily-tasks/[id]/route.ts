import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE — deactivates (soft delete) the daily task
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.dailyTask.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}

// PATCH — toggle completion for today
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const { id } = await params;
  const { date } = await req.json(); // "YYYY-MM-DD"

  const dailyTask = await prisma.dailyTask.findUnique({ where: { id } });
  if (!dailyTask) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (dailyTask.assigneeId !== userId) {
    return NextResponse.json({ error: "Apenas o responsável pode marcar esta tarefa" }, { status: 403 });
  }

  const existing = await prisma.dailyTaskCompletion.findUnique({
    where: { dailyTaskId_date: { dailyTaskId: id, date } },
  });

  if (existing) {
    await prisma.dailyTaskCompletion.delete({ where: { id: existing.id } });
    return NextResponse.json({ completed: false });
  } else {
    await prisma.dailyTaskCompletion.create({
      data: { dailyTaskId: id, date, userId },
    });
    return NextResponse.json({ completed: true });
  }
}
