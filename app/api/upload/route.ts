import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { put } from "@vercel/blob";

const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4MB — stays under Vercel's function request body limit

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Arquivo maior que 4MB" }, { status: 400 });
  }

  const blob = await put(file.name, file, { access: "public", addRandomSuffix: true });
  return NextResponse.json({ url: blob.url, name: file.name });
}
