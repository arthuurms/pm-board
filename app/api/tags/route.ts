import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(tags);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role !== "admin") return NextResponse.json({ error: "Apenas admins podem criar tags" }, { status: 403 });

  const { name, emoji } = await req.json();
  if (!name) return NextResponse.json({ error: "name é obrigatório" }, { status: 400 });

  const tag = await prisma.tag.create({ data: { name, emoji: emoji || null } });
  return NextResponse.json(tag, { status: 201 });
}
