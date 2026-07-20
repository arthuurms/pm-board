import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role === "admin";
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  if (!(await requireAdmin(userId))) return NextResponse.json({ error: "Apenas admins podem editar tags" }, { status: 403 });

  const { id } = await params;
  const { name, emoji } = await req.json();
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (emoji !== undefined) data.emoji = emoji || null;

  const tag = await prisma.tag.update({ where: { id }, data });
  return NextResponse.json(tag);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  if (!(await requireAdmin(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.tag.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
