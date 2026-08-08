import { NextResponse } from "next/server";
import { getPublicOrigin, metadataCorsOptionsRequestHandler } from "mcp-handler";

export async function GET(req: Request) {
  const origin = getPublicOrigin(req);
  return NextResponse.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/api/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["tasks:write"],
    },
    { headers: { "Access-Control-Allow-Origin": "*" } }
  );
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
