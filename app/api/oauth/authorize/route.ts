import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface OAuthParams {
  responseType: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
}

function readParams(params: URLSearchParams): OAuthParams {
  return {
    responseType: params.get("response_type") ?? "",
    clientId: params.get("client_id") ?? "",
    redirectUri: params.get("redirect_uri") ?? "",
    state: params.get("state") ?? "",
    codeChallenge: params.get("code_challenge") ?? "",
    codeChallengeMethod: params.get("code_challenge_method") ?? "",
    scope: params.get("scope") ?? "tasks:write",
  };
}

async function validateClientAndRedirect(clientId: string, redirectUri: string) {
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) return { ok: false as const, message: "client_id desconhecido" };
  if (!client.redirectUris.includes(redirectUri)) {
    return { ok: false as const, message: "redirect_uri não registrado para este client" };
  }
  return { ok: true as const, client };
}

function renderForm(p: OAuthParams, error?: string) {
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Entrar no Clickfy</title>
<style>
  body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  form { background: #1e293b; padding: 2rem; border-radius: 12px; width: 320px; box-shadow: 0 10px 30px rgba(0,0,0,.3); }
  h1 { font-size: 1.25rem; margin: 0 0 .25rem; }
  p.sub { color: #94a3b8; font-size: .85rem; margin: 0 0 1.5rem; }
  label { display: block; font-size: .85rem; margin-bottom: .25rem; }
  input[type=email], input[type=password] { width: 100%; padding: .6rem; margin-bottom: 1rem; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: #e2e8f0; box-sizing: border-box; }
  button { width: 100%; padding: .7rem; border-radius: 8px; border: none; background: #6366f1; color: white; font-weight: 600; cursor: pointer; }
  .error { background: #7f1d1d; color: #fecaca; padding: .5rem .75rem; border-radius: 8px; font-size: .85rem; margin-bottom: 1rem; }
</style></head>
<body>
<form method="POST">
  <h1>Clickfy</h1>
  <p class="sub">Entre para autorizar o acesso do Claude às suas tarefas.</p>
  ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
  <label for="email">Email</label>
  <input type="email" id="email" name="email" required autofocus>
  <label for="password">Senha</label>
  <input type="password" id="password" name="password" required>
  <input type="hidden" name="response_type" value="${escapeHtml(p.responseType)}">
  <input type="hidden" name="client_id" value="${escapeHtml(p.clientId)}">
  <input type="hidden" name="redirect_uri" value="${escapeHtml(p.redirectUri)}">
  <input type="hidden" name="state" value="${escapeHtml(p.state)}">
  <input type="hidden" name="code_challenge" value="${escapeHtml(p.codeChallenge)}">
  <input type="hidden" name="code_challenge_method" value="${escapeHtml(p.codeChallengeMethod)}">
  <input type="hidden" name="scope" value="${escapeHtml(p.scope)}">
  <button type="submit">Entrar e autorizar</button>
</form>
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const p = readParams(url.searchParams);

  if (p.responseType !== "code") {
    return new Response("response_type deve ser 'code'", { status: 400 });
  }
  if (p.codeChallengeMethod !== "S256" || !p.codeChallenge) {
    return new Response("PKCE (code_challenge com S256) é obrigatório", { status: 400 });
  }
  const check = await validateClientAndRedirect(p.clientId, p.redirectUri);
  if (!check.ok) return new Response(check.message, { status: 400 });

  return renderForm(p);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const p = readParams(new URLSearchParams(Array.from(form.entries()).map(([k, v]) => [k, String(v)])));

  if (p.responseType !== "code" || p.codeChallengeMethod !== "S256" || !p.codeChallenge) {
    return new Response("Parâmetros OAuth inválidos", { status: 400 });
  }
  const check = await validateClientAndRedirect(p.clientId, p.redirectUri);
  if (!check.ok) return new Response(check.message, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user ? await bcrypt.compare(password, user.password) : false;
  if (!user || !valid) {
    return renderForm(p, "Email ou senha inválidos.");
  }

  const code = randomBytes(32).toString("base64url");
  await prisma.oAuthAuthorizationCode.create({
    data: {
      code,
      clientId: p.clientId,
      redirectUri: p.redirectUri,
      userId: user.id,
      codeChallenge: p.codeChallenge,
      codeChallengeMethod: p.codeChallengeMethod,
      scope: p.scope,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  const redirect = new URL(p.redirectUri);
  redirect.searchParams.set("code", code);
  if (p.state) redirect.searchParams.set("state", p.state);
  return Response.redirect(redirect.toString(), 302);
}
