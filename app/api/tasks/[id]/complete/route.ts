import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { put } from "@vercel/blob";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { notifyTaskCompleted } from "@/lib/discord";
import { checkProof } from "@/lib/completeTask";

/**
 * POST /api/tasks/[id]/complete   (multipart/form-data, field "file" = the screenshot)
 *
 * The only way to complete a task: without a valid image nothing changes. The screenshot is
 * stored on the task and posted to Discord together with the completion notice.
 * Response: { task, discord: "sent" | "failed" | "off" }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const allowed = await hasPermission(userId, "move_completed");
  if (!allowed) return NextResponse.json({ error: "Sem permissão para mover para Concluída" }, { status: 403 });

  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (task.status === "completed") {
    return NextResponse.json({ error: "Esta tarefa já está concluída." }, { status: 400 });
  }

  let bytes: Uint8Array | null = null;
  let originalName = "print";
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (file instanceof File) {
      bytes = new Uint8Array(await file.arrayBuffer());
      originalName = file.name || "print";
    }
  } catch {
    // a malformed body counts as "no proof sent"
  }

  const check = checkProof(bytes);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  let proofUrl: string;
  try {
    const blob = await put(`provas/${id}-${Date.now()}.${check.type.ext}`, Buffer.from(bytes as Uint8Array), {
      access: "public",
      addRandomSuffix: true,
      contentType: check.type.mime,
    });
    proofUrl = blob.url;
  } catch (err) {
    console.error("Completion proof upload failed:", err);
    return NextResponse.json({ error: "Não consegui salvar a print. Tente de novo." }, { status: 502 });
  }

  const now = new Date();
  const [, updated] = await prisma.$transaction([
    prisma.statusHistory.create({
      data: { taskId: id, fromStatus: task.status, toStatus: "completed", changedById: userId, changedAt: now },
    }),
    prisma.task.update({
      where: { id },
      data: {
        status: "completed",
        completedAt: now,
        onTime: now <= new Date(task.dueDate),
        proofUrl,
        proofName: originalName.slice(0, 120),
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true } },
        statusHistory: {
          include: { changedBy: { select: { id: true, name: true } } },
          orderBy: { changedAt: "asc" },
        },
      },
    }),
  ]);

  let discord: "sent" | "failed" | "off" = "off";
  if (process.env.DISCORD_WEBHOOK_URL) {
    const messageId = await notifyTaskCompleted({
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
      proofUrl,
    });
    if (messageId) {
      await prisma.task.update({ where: { id }, data: { discordMessageId: messageId } });
      discord = "sent";
    } else {
      discord = "failed";
    }
  }

  return NextResponse.json({ task: updated, discord });
}
