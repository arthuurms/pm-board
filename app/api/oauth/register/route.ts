import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { metadataCorsOptionsRequestHandler } from "mcp-handler";

// RFC 7591 Dynamic Client Registration — open registration, as expected by
// MCP clients (Claude, etc.) that discover this server and register themselves
// on first connection, before any user has logged in.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: "corpo inválido" }, { status: 400 });
  }

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];
  if (redirectUris.length === 0) {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "redirect_uris é obrigatório" },
      { status: 400 }
    );
  }

  const clientName = typeof body.client_name === "string" ? body.client_name : null;
  const clientId = randomUUID();

  await prisma.oAuthClient.create({
    data: { clientId, clientName, redirectUris },
  });

  return NextResponse.json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      ...(clientName ? { client_name: clientName } : {}),
    },
    { status: 201, headers: { "Access-Control-Allow-Origin": "*" } }
  );
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
