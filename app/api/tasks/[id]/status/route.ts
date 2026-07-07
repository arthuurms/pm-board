import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";

/**
 * PATCH /api/tasks/[id]/status
 * body: { status: "pending" | "in_progress" | "completed", note?: string, isRework?: boolean }
 *
 * This is the central endpoint for all task status transitions.
 * Permission check:
 *   pending → in_progress  requires "move_in_progress"
 *   * → completed          requires "move_completed"
 *   mark as rework         requires "mark_rework"
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const body = await req.json();
  const { status, note, isRework } = body as {
    status?: string;
    note?: string;
    isRework?: boolean;
  };

  const { id } = await params;

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Permission checks
  if (status === "in_progress") {
    const allowed = await hasPermission(userId, "move_in_progress");
    if (!allowed) return NextResponse.json({ error: "Sem permissão para mover para Em andamento" }, { status: 403 });
  }

  if (status === "completed") {
    const allowed = await hasPermission(userId, "move_completed");
    if (!allowed) return NextResponse.json({ error: "Sem permissão para mover para Concluída" }, { status: 403 });
  }

  const now = new Date();
  const updateData: Record<string, unknown> = {};

  if (status && status !== task.status) {
    updateData.status = status;

    if (status === "in_progress" && !task.startedAt) {
      updateData.startedAt = now;
    }

    if (status === "completed") {
      updateData.completedAt = now;
      // Automatically determine if delivery was on time
      updateData.onTime = now <= new Date(task.dueDate);
    }

    if (status === "pending") {
      // Reopening: clear completion data
      updateData.completedAt = null;
      updateData.onTime = null;
    }

    await prisma.statusHistory.create({
      data: {
        taskId: id,
        fromStatus: task.status,
        toStatus: status,
        changedById: userId,
        changedAt: now,
        note: note || null,
      },
    });
  }

  // Each call with addRework:true increments the counter by 1 and sets isRework = true.
  if (body.addRework === true) {
    const allowed = await hasPermission(userId, "mark_rework");
    if (!allowed) return NextResponse.json({ error: "Sem permissão para marcar como retrabalho" }, { status: 403 });
    updateData.isRework = true;
    updateData.reworkCount = { increment: 1 };
  }

  if (body.removeRework === true) {
    const allowed = await hasPermission(userId, "mark_rework");
    if (!allowed) return NextResponse.json({ error: "Sem permissão para alterar retrabalho" }, { status: 403 });
    if (task.reworkCount > 0) {
      const newCount = task.reworkCount - 1;
      updateData.reworkCount = newCount;
      // Clear the rework flag when count reaches zero
      if (newCount === 0) updateData.isRework = false;
    }
  }

  const updated = await prisma.task.update({
    where: { id },
    data: updateData,
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      creator: { select: { id: true, name: true } },
      statusHistory: {
        include: { changedBy: { select: { id: true, name: true } } },
        orderBy: { changedAt: "asc" },
      },
    },
  });

  return NextResponse.json(updated);
}
