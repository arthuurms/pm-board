import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const INCLUDE = {
  assignee: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true } },
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const { searchParams } = new URL(req.url);
  const assigneeIdParam = searchParams.get("assigneeId");

  const requester = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  const isAdmin = requester?.role === "admin";

  const goals = await prisma.goal.findMany({
    // Non-admins only ever see their own goals; admins can optionally filter by person.
    where: isAdmin ? (assigneeIdParam ? { assigneeId: assigneeIdParam } : {}) : { assigneeId: userId },
    include: INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(goals);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const requester = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (requester?.role !== "admin") return NextResponse.json({ error: "Apenas admins podem criar metas" }, { status: 403 });

  const { title, description, assigneeId } = await req.json();
  if (!title || !assigneeId) {
    return NextResponse.json({ error: "title e assigneeId são obrigatórios" }, { status: 400 });
  }

  const goal = await prisma.goal.create({
    data: { title, description, assigneeId, creatorId: userId },
    include: INCLUDE,
  });

  return NextResponse.json(goal, { status: 201 });
}
