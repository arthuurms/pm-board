import crypto from "crypto";

// Access tokens are signed with MCP_API_KEY instead of a JWT library: this
// process both issues and verifies them, so there's no algorithm-confusion
// surface to worry about — just an HMAC over a JSON payload.
function signingSecret(): string {
  const key = process.env.MCP_API_KEY;
  if (!key) throw new Error("MCP_API_KEY não configurado");
  return key;
}

export interface AccessTokenPayload {
  sub: string; // userId
  cid: string; // OAuth client_id
  scope?: string;
  iat: number;
  exp: number;
}

export function signAccessToken(
  payload: { sub: string; cid: string; scope?: string },
  expiresInSeconds = 3600
): string {
  const now = Math.floor(Date.now() / 1000);
  const body: AccessTokenPayload = { ...payload, iat: now, exp: now + expiresInSeconds };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", signingSecret()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  const idx = token.lastIndexOf(".");
  if (idx === -1) return null;
  const encoded = token.slice(0, idx);
  const sig = token.slice(idx + 1);

  const expectedSig = crypto.createHmac("sha256", signingSecret()).update(encoded).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  let payload: AccessTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const hash = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return hash === codeChallenge;
}
