import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, getUserPermissions } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const perms = await getUserPermissions(id);
  return NextResponse.json(perms);
}

/**
 * PUT /api/users/[id]/permissions
 * body: { action: string, granted: boolean }
 * Requires "manage_permissions" permission.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const callerId = (session.user as { id: string }).id;
  const allowed = await hasPermission(callerId, "manage_permissions");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { action, granted } = await req.json();

  await prisma.userPermission.upsert({
    where: { userId_action: { userId: id, action } },
    update: { granted },
    create: { userId: id, action, granted },
  });

  const perms = await getUserPermissions(id);
  return NextResponse.json(perms);
}
