import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { hasPermission } from "@/lib/permissions";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const callerId = (session.user as { id: string }).id;
  const allowed = await hasPermission(callerId, "manage_permissions");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { name, email, password } = await req.json();

  const updateData: { name?: string; email?: string; password?: string } = {};
  if (name) updateData.name = name;
  if (email) updateData.email = email;
  if (password) updateData.password = await bcrypt.hash(password, 10);

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: { id: true, name: true, email: true, role: true, position: true },
  });

  return NextResponse.json(user);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const callerId = (session.user as { id: string }).id;
  const allowed = await hasPermission(callerId, "manage_permissions");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  if (id === callerId) {
    return NextResponse.json({ error: "Você não pode excluir sua própria conta" }, { status: 400 });
  }

  // Remove related records before deleting the user
  await prisma.statusHistory.deleteMany({ where: { changedById: id } });
  await prisma.incident.deleteMany({ where: { reportedById: id } });
  // Unassign tasks created by this user (set creator to caller)
  await prisma.task.updateMany({ where: { creatorId: id }, data: { creatorId: callerId } });
  // Delete tasks assigned to this user and their history
  const assignedTasks = await prisma.task.findMany({ where: { assigneeId: id }, select: { id: true } });
  const taskIds = assignedTasks.map((t) => t.id);
  if (taskIds.length > 0) {
    await prisma.statusHistory.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  }
  await prisma.userPermission.deleteMany({ where: { userId: id } });
  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
