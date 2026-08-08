import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken, randomToken, signAccessToken, verifyPkce } from "@/lib/oauth";
import { metadataCorsOptionsRequestHandler } from "mcp-handler";

const ACCESS_TOKEN_TTL_SECONDS = 3600;

async function issueTokens(userId: string, clientId: string, scope?: string) {
  const accessToken = signAccessToken({ sub: userId, cid: clientId, scope }, ACCESS_TOKEN_TTL_SECONDS);
  const refreshToken = randomToken();
  await prisma.oAuthRefreshToken.create({
    data: { tokenHash: hashToken(refreshToken), clientId, userId },
  });
  return NextResponse.json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope,
    },
    { headers: { "Access-Control-Allow-Origin": "*" } }
  );
}

function errorResponse(error: string, description: string, status = 400) {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { "Access-Control-Allow-Origin": "*" } }
  );
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  let params: URLSearchParams;
  if (contentType.includes("application/json")) {
    const body = await req.json();
    params = new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
  } else {
    params = new URLSearchParams(await req.text());
  }

  const grantType = params.get("grant_type");

  if (grantType === "authorization_code") {
    const code = params.get("code");
    const redirectUri = params.get("redirect_uri");
    const clientId = params.get("client_id");
    const codeVerifier = params.get("code_verifier");
    if (!code || !redirectUri || !clientId || !codeVerifier) {
      return errorResponse("invalid_request", "code, redirect_uri, client_id e code_verifier são obrigatórios");
    }

    const authCode = await prisma.oAuthAuthorizationCode.findUnique({ where: { code } });
    if (!authCode || authCode.expiresAt < new Date()) {
      return errorResponse("invalid_grant", "código inválido ou expirado");
    }
    if (authCode.clientId !== clientId || authCode.redirectUri !== redirectUri) {
      return errorResponse("invalid_grant", "client_id ou redirect_uri não correspondem");
    }
    if (!verifyPkce(codeVerifier, authCode.codeChallenge)) {
      return errorResponse("invalid_grant", "code_verifier inválido");
    }

    // single use
    await prisma.oAuthAuthorizationCode.delete({ where: { code } });

    return issueTokens(authCode.userId, authCode.clientId, authCode.scope ?? undefined);
  }

  if (grantType === "refresh_token") {
    const refreshToken = params.get("refresh_token");
    const clientId = params.get("client_id");
    if (!refreshToken || !clientId) {
      return errorResponse("invalid_request", "refresh_token e client_id são obrigatórios");
    }

    const stored = await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
    if (!stored || stored.revokedAt || stored.clientId !== clientId) {
      return errorResponse("invalid_grant", "refresh_token inválido");
    }

    return issueTokens(stored.userId, stored.clientId);
  }

  return errorResponse("unsupported_grant_type", `grant_type "${grantType}" não suportado`);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
