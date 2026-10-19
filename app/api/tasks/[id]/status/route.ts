import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { notifyTaskApproved } from "@/lib/discord";

/**
 * PATCH /api/tasks/[id]/status
 * body: { status: "pending" | "in_progress" | "completed", note?: string, isRework?: boolean }
 *
 * This is the central endpoint for all task status transitions.
 * Permission check:
 *   pending → in_progress  requires "move_in_progress"
 *   * → completed          NOT handled here: rejected with 400 (completing needs the proof screenshot,
 *                          see POST /api/tasks/[id]/complete)
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

  // Completing needs the proof screenshot, which only POST /api/tasks/[id]/complete accepts.
  // Rejecting it here means no client (or hand-made request) can complete a task without the print.
  if (status === "completed" && task.status !== "completed") {
    return NextResponse.json(
      { error: "Para concluir a tarefa é obrigatório enviar a print do que foi feito." },
      { status: 400 }
    );
  }

  const now = new Date();
  const updateData: Record<string, unknown> = {};
  let justApproved = false;

  if (status && status !== task.status) {
    updateData.status = status;

    if (status === "in_progress" && !task.startedAt) {
      updateData.startedAt = now;
    }

    if (status === "pending") {
      // Reopening: clear completion data (the old proof no longer applies; completing again needs a new one)
      updateData.completedAt = null;
      updateData.onTime = null;
      updateData.approved = false;
      updateData.approvedAt = null;
      updateData.proofUrl = null;
      updateData.proofName = null;
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
    const reworkReason: string | undefined = body.reworkReason;
    updateData.isRework = true;
    updateData.reworkCount = { increment: 1 };
    updateData.reworkReason = reworkReason || null;
    // Move task back to pending and clear completion data
    updateData.status = "pending";
    updateData.completedAt = null;
    updateData.onTime = null;
    updateData.approved = false;
    updateData.approvedAt = null;
    updateData.proofUrl = null;
    updateData.proofName = null;
    await prisma.statusHistory.create({
      data: {
        taskId: id,
        fromStatus: task.status,
        toStatus: "pending",
        changedById: userId,
        changedAt: now,
        note: reworkReason ? `Retrabalho: ${reworkReason}` : "Retrabalho registrado",
      },
    });
  }

  if (body.approve === true) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const isCreator = task.creatorId === userId;
    const isAdmin = user?.role === "admin";
    if (!isCreator && !isAdmin) {
      return NextResponse.json({ error: "Apenas quem solicitou a tarefa pode aprová-la" }, { status: 403 });
    }
    if (task.status !== "completed") {
      return NextResponse.json({ error: "Só é possível aprovar tarefas concluídas" }, { status: 400 });
    }
    updateData.approved = true;
    updateData.approvedAt = now;
    justApproved = true;
  }

  // Lets whoever can mark rework fix a typo/add detail to an existing
  // reason, without re-triggering the whole rework flow (count, status, etc).
  if (body.updateReworkReason !== undefined) {
    const allowed = await hasPermission(userId, "mark_rework");
    if (!allowed) return NextResponse.json({ error: "Sem permissão para editar o motivo do retrabalho" }, { status: 403 });
    updateData.reworkReason = body.updateReworkReason || null;
  }

  if (body.removeRework === true) {
    const allowed = await hasPermission(userId, "mark_rework");
    if (!allowed) return NextResponse.json({ error: "Sem permissão para alterar retrabalho" }, { status: 403 });
    if (task.reworkCount > 0) {
      const newCount = task.reworkCount - 1;
      updateData.reworkCount = newCount;
      // Clear the rework flag (and its reason) when count reaches zero
      if (newCount === 0) {
        updateData.isRework = false;
        updateData.reworkReason = null;
      }
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

  if (justApproved && updated.discordMessageId) {
    await notifyTaskApproved(updated.discordMessageId, {
      title: updated.title,
      description: updated.description,
      priority: updated.priority,
      assigneeName: updated.assignee.name,
      creatorName: updated.creator.name,
      dueDate: updated.dueDate,
      completedAt: updated.completedAt!,
      onTime: updated.onTime,
      isRework: updated.isRework,
      reworkCount: updated.reworkCount,
      proofUrl: updated.proofUrl,
    });
  }

  return NextResponse.json(updated);
}
