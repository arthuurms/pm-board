import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { hasPermission, ALL_ACTIONS } from "@/lib/permissions";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, position: true, createdAt: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const allowed = await hasPermission(userId, "manage_permissions");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, email, password, role, position } = await req.json();
  if (!name || !email || !password) {
    return NextResponse.json({ error: "name, email, password obrigatórios" }, { status: 400 });
  }

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, password: hash, role: role || "collaborator", position },
  });

  // Default permissions for new users
  const actions = role === "admin" ? ALL_ACTIONS : ALL_ACTIONS.filter((a) => a !== "manage_permissions");
  for (const action of actions) {
    await prisma.userPermission.create({
      data: { userId: user.id, action, granted: role === "admin" },
    });
  }
  if (role !== "admin") {
    await prisma.userPermission.create({
      data: { userId: user.id, action: "manage_permissions", granted: false },
    });
  }

  const { password: _, ...safe } = user;
  return NextResponse.json(safe, { status: 201 });
}
