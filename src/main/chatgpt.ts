// @ts-nocheck
// Adapted from Forward-Future/folio (MIT), electron/ai.cjs, 2026-10-31.
// Copyright its original contributors; see THIRD_PARTY_NOTICES.md.
// OpenAI OAuth credentials remain in the Electron main process; never in the renderer.
// ChatGPT OAuth and Responses API integration, optional and explicit.
// Source license: licenses/Folio-MIT.txt.
import { app, net, safeStorage, shell, ipcMain } from "electron";
import { trustedSender } from "./ipcSecurity";
import { getMainWindow } from "./window";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";

const AUTH_ISSUER = "https://auth.openai.com";
const AUTHORIZE_URL = "https://auth.openai.com/api/accounts/authorize";
const TOKEN_URL = "https://auth.openai.com/api/accounts/oauth/token";
const API = "https://api.openai.com/v1";
const SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const USAGE_URL = "https://chatgpt.com/settings/usage";
const REFRESH_FAILURES = new Set(["invalid_grant", "invalid_refresh_token", "token_expired", "refresh_token_expired",
  "refresh_token_invalidated", "refresh_token_reused"]);

const dir = () => path.join(app.getPath("userData"), "ai");
const file = (name) => path.join(dir(), name);
const b64url = (buf) => Buffer.from(buf).toString("base64url");

function writeAtomic(name, contents) {
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(file(name) + ".tmp", contents, { mode: 0o600 });
  fs.renameSync(file(name) + ".tmp", file(name));
}

// ── ChatGPT credentials (encrypted with Windows' per-user data protection) ──────────────────
function loadHost() {
  try {
    const host = JSON.parse(fs.readFileSync(file("chatgpt-host.json"), "utf8"));
    if (typeof host.hostId === "string") return host;
  } catch {}
  const host = { hostId: `urn:uuid:${crypto.randomUUID()}`, clientId: null, welcomeSeen: false };
  writeAtomic("chatgpt-host.json", JSON.stringify(host));
  return host;
}
function saveHost(host) {
  writeAtomic("chatgpt-host.json", JSON.stringify(host));
}

let session = null; // { accessToken, refreshToken, idToken, expiresAt, scopes, email, name }
async function loadSession() {
  if (session) return session;
  try {
    if (!fs.existsSync(file("chatgpt-session.bin")) || !(await safeStorage.isAsyncEncryptionAvailable())) return null;
    const { result } = await safeStorage.decryptStringAsync(fs.readFileSync(file("chatgpt-session.bin")));
    session = JSON.parse(result);
  } catch { session = null; }
  return session;
}
async function saveSession(next) {
  session = next;
  if (!next) {
    try { fs.rmSync(file("chatgpt-session.bin"), { force: true }); } catch {}
    return;
  }
  // Without OS encryption, keep the session in memory only (sign in again next launch).
  if (await safeStorage.isAsyncEncryptionAvailable()) writeAtomic("chatgpt-session.bin", await safeStorage.encryptStringAsync(JSON.stringify(next)));
}

async function postForm(url, params) {
  const response = await net.fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(params).toString(),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: response.ok, status: response.status, json, text };
}

let openIdConfig = null;
async function getOpenIdConfig() {
  if (openIdConfig) return openIdConfig;
  const response = await net.fetch(`${AUTH_ISSUER}/.well-known/openid-configuration`);
  if (!response.ok) throw new Error("Couldn't reach OpenAI's sign-in service.");
  openIdConfig = await response.json();
  return openIdConfig;
}

/** Verifies the ID token's RS256 signature and claims; returns its payload. */
async function verifyIdToken(idToken, clientId, nonce) {
  const [h, p, sig] = String(idToken).split(".");
  const header = JSON.parse(Buffer.from(h, "base64url").toString());
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  const config = await getOpenIdConfig();
  const jwks = await (await net.fetch(config.jwks_uri)).json();
  const jwk = jwks.keys?.find((k) => k.kid === header.kid);
  if (!jwk || header.alg !== "RS256") throw new Error("Unexpected sign-in token.");
  const valid = crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), crypto.createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(sig, "base64url"));
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  const authorizedParty = audience.length > 1 ? payload.azp === clientId : payload.azp === undefined || payload.azp === clientId;
  if (!valid || payload.iss !== AUTH_ISSUER || !audience.includes(clientId) || !authorizedParty || payload.nonce !== nonce
    || !Number.isFinite(payload.exp) || payload.exp * 1000 < Date.now()) {
    throw new Error("The sign-in response couldn't be verified. Please try again.");
  }
  return payload;
}

const CALLBACK_PAGE = `<!doctype html><meta charset="utf-8"><title>PDF</title>
<body style="font:16px system-ui;display:grid;place-items:center;height:90vh;color:#222">
<p>You can close this tab and return to PDF.</p></body>`;

let signInInProgress = null;

async function signInChatGPT() {
  if (signInInProgress) return signInInProgress;
  signInInProgress = (async () => {
    const host = loadHost();
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
    const state = b64url(crypto.randomBytes(24));
    const nonce = b64url(crypto.randomBytes(24));

    // Loopback redirect on 127.0.0.1; only the port may differ between sign-ins.
    const server = http.createServer();
    const callback = new Promise((resolve, reject) => {
      server.on("request", (req, res) => {
        try {
          const url = new URL(req.url, "http://127.0.0.1");
          // Only a response carrying this attempt's state counts; anything else is ignored, so stray
          // requests from other local software or web pages can't end the sign-in.
          if (url.pathname !== "/auth/callback" || url.searchParams.get("state") !== state) { res.writeHead(404).end(); return; }
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(CALLBACK_PAGE);
          if (url.searchParams.get("error")) return reject(new Error(url.searchParams.get("error") === "access_denied" ? "Sign-in was cancelled." : "ChatGPT sign-in failed."));
          resolve(url.searchParams);
        } catch {
          // A malformed request line shouldn't be able to take the app down.
          res.writeHead(400).end();
        }
      });
    });
    callback.catch(() => {}); // handled by the race below; avoids an early unhandled rejection
    let waitTimer;
    try {
      let listenTimer;
      await new Promise((resolve, reject) => {
        let fellBack = false;
        server.on("error", (error) => {
          // Port 1455 is the documented default; any free loopback port also works.
          if (!fellBack && error.code === "EADDRINUSE") { fellBack = true; server.listen(0, "127.0.0.1", resolve); }
          else reject(new Error("Couldn't start sign-in."));
        });
        server.listen(1455, "127.0.0.1", resolve);
        listenTimer = setTimeout(() => reject(new Error("Couldn't start sign-in.")), 5000);
      }).finally(() => clearTimeout(listenTimer));
      const redirectUri = `http://127.0.0.1:${server.address().port}/auth/callback`;
      const timeout = new Promise((_, reject) => {
        waitTimer = setTimeout(() => reject(new Error("Sign-in timed out. Please try again.")), 5 * 60_000);
      });
      timeout.catch(() => {});

      const params = {
        response_type: "code",
        client_id: host.clientId || "dynamic_agent_client",
        redirect_uri: redirectUri,
        scope: SCOPES,
        resource: API,
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: "S256",
        ext_agent_host_id: host.hostId,
      };
      if (!host.clientId) params.agent_name_hint = "PDF";
      await shell.openExternal(`${AUTHORIZE_URL}?${new URLSearchParams(params)}`);

      const query = await Promise.race([callback, timeout]);
      const clientId = query.get("client_id") || host.clientId;
      if (!clientId) throw new Error("ChatGPT didn't finish registering PDF. Please try again.");
      // Keep the issued client ID for every later sign-in on this computer, even if the rest fails.
      if (host.clientId !== clientId) saveHost({ ...host, clientId });
      const exchange = await postForm(TOKEN_URL, {
        grant_type: "authorization_code", client_id: clientId, code: query.get("code"), code_verifier: verifier, redirect_uri: redirectUri, resource: API,
      });
      if (!exchange.ok || !exchange.json?.access_token) throw new Error("ChatGPT sign-in failed. Please try again.");
      const tokens = exchange.json;
      const claims = await verifyIdToken(tokens.id_token, clientId, nonce);
      const scopes = String(tokens.scope || query.get("scope") || "").split(/[\s+]+/);
      if (!scopes.includes("chatgpt.tokens.use.direct")) {
        throw new Error("ChatGPT plan usage wasn't granted. Sign in again and allow PDF to use your plan.");
      }
      await saveSession({
        accessToken: tokens.access_token, refreshToken: tokens.refresh_token, idToken: tokens.id_token,
        expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000, scopes, email: claims.email ?? "", name: claims.name ?? "",
      });
      return await chatgptStatus();
    } finally {
      clearTimeout(waitTimer);
      server.close();
    }
  })();
  try { return await signInInProgress; } finally { signInInProgress = null; }
}

let refreshing = null;
async function accessToken(force = false) {
  const current = await loadSession();
  if (!current) throw Object.assign(new Error("Continue with ChatGPT to use your plan in PDF."), { code: "signed_out" });
  if (!force && current.expiresAt - 60_000 > Date.now()) return current.accessToken;
  // Refresh tokens rotate: never run two refreshes at once.
  refreshing ??= (async () => {
    const { clientId } = loadHost();
    const result = await postForm(TOKEN_URL, { grant_type: "refresh_token", client_id: clientId, refresh_token: current.refreshToken, resource: API });
    if (!result.ok) {
      const code = result.json?.error;
      if (REFRESH_FAILURES.has(code)) {
        await saveSession(null);
        throw Object.assign(new Error("Your ChatGPT sign-in has ended. Continue with ChatGPT to reconnect."), { code: "signed_out" });
      }
      throw new Error("Couldn't refresh your ChatGPT sign-in. Check your connection and try again.");
    }
    const t = result.json;
    // Signed out while this refresh was in flight: don't bring the session back.
    if (!session || session.refreshToken !== current.refreshToken) {
      throw Object.assign(new Error("Continue with ChatGPT to use your plan in PDF."), { code: "signed_out" });
    }
    await saveSession({ ...current, accessToken: t.access_token, refreshToken: t.refresh_token ?? current.refreshToken,
      idToken: t.id_token ?? current.idToken, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 });
    return session.accessToken;
  })().finally(() => { refreshing = null; });
  return refreshing;
}

async function signOutChatGPT() {
  // Let an in-flight refresh finish first, so the newest refresh token is the one revoked.
  await refreshing?.catch(() => {});
  const current = await loadSession();
  await saveSession(null);
  if (!current?.refreshToken) return chatgptStatus();
  try {
    const { revocation_endpoint } = await getOpenIdConfig();
    if (revocation_endpoint) {
      await postForm(revocation_endpoint, { token: current.refreshToken, token_type_hint: "refresh_token", client_id: loadHost().clientId });
    }
  } catch {
    /* tokens are already cleared locally; the person can also disconnect PDF in ChatGPT settings */
  }
  return chatgptStatus();
}

async function chatgptStatus() {
  const current = await loadSession();
  const host = loadHost();
  return { connected: !!current, email: current?.email ?? "", name: current?.name ?? "", welcomeSeen: !!host.welcomeSeen,
    encrypted: await safeStorage.isAsyncEncryptionAvailable() };
}

async function chatgptModels() {
  const token = await accessToken();
  const response = await net.fetch(`${API}/models`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Couldn't load ChatGPT models (${response.status}).`);
  const json = await response.json();
  const list = Array.isArray(json.models) ? json.models : Array.isArray(json.data) ? json.data : [];
  return list.filter((m) => m.visibility === undefined || m.visibility === "list")
    .map((m) => ({ id: m.slug ?? m.id, name: m.display_name ?? m.slug ?? m.id }))
    .filter((m) => typeof m.id === "string");
}

async function askChatGPT({ model, instructions, messages }, emit, signal) {
  const body = JSON.stringify({
    model,
    instructions,
    input: messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
    store: false,
    stream: true,
  });
  const send = (token) => net.fetch(`${API}/responses`, {
    method: "POST", signal, body,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "text/event-stream" },
  });
  let response = await send(await accessToken());
  if (response.status === 401) response = await send(await accessToken(true));
  if (!response.ok) {
    let code = "";
    try { const j = await response.json(); code = j.error?.code ?? j.code ?? ""; } catch {}
    throw usageError(code, response.status);
  }
  // Server-sent events: blank-line separated blocks of "event:" / "data:" lines.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let split;
    while ((split = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
      if (!data || data === "[DONE]") continue;
      let event;
      try { event = JSON.parse(data); } catch { continue; }
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") emit(event.delta);
      else if (event.type === "response.completed") completed = true;
      else if (event.type === "response.failed" || event.type === "error") {
        throw usageError(event.response?.error?.code ?? event.error?.code ?? event.code ?? "", 0);
      } else if (event.type === "response.incomplete") {
        throw new Error("The answer was cut short. Try a shorter question or a smaller selection.");
      }
    }
  }
  if (!completed) throw new Error("The connection to ChatGPT ended early. Please try again.");
}

function usageError(code, status) {
  if (code === "subscription_sharing_usage_limit_exceeded" || status === 429) {
    return Object.assign(new Error("You've reached a ChatGPT usage limit."), { code: "usage_limit", link: USAGE_URL });
  }
  if (code === "subscription_sharing_usage_unavailable" || status === 503) {
    return new Error("ChatGPT is temporarily unavailable. Please try again in a moment.");
  }
  if (code === "subscription_sharing_invalid_user" || status === 401) {
    return Object.assign(new Error("ChatGPT couldn't confirm your plan. Continue with ChatGPT to reconnect."), { code: "signed_out" });
  }
  return new Error(`ChatGPT couldn't answer${status ? ` (${status})` : ""}. Please try again.`);
}


// Only our own top-level app may initiate/cancel AI work.
const active = new Map();
function validRequest(req) {
  return req && typeof req.id === 'string' && req.id.length >= 8 && req.id.length < 100
    && typeof req.model === 'string' && req.model.length > 0 && req.model.length < 100
    && typeof req.instructions === 'string' && req.instructions.length <= 8000
    && Array.isArray(req.messages) && req.messages.length > 0 && req.messages.length <= 20
    && req.messages.every(m => m && (m.role === 'user' || m.role === 'assistant')
      && typeof m.content === 'string' && m.content.length <= 175000)
    && req.messages.reduce((n,m) => n + m.content.length, 0) <= 200000;
}
export function registerChatGPT(): void {
  const handle = (name, fn) => ipcMain.handle(name, (event, ...args) => {
    if (!trustedSender(event, getMainWindow())) throw new Error('Acces AI neautorizat.');
    return fn(...args);
  });
  const emit = (event) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send('pdf:ai-event', event);
  };
  handle('pdf:ai-status', () => chatgptStatus());
  handle('pdf:ai-signin', async () => {
    try { return { ok: true, status: await signInChatGPT() }; }
    catch (error) { return { ok: false, error: String(error?.message ?? error) }; }
  });
  handle('pdf:ai-signout', async () => {
    for (const controller of active.values()) controller.abort();
    return signOutChatGPT();
  });
  handle('pdf:ai-models', async () => {
    try { return { ok: true, models: await chatgptModels() }; }
    catch (error) { return { ok: false, error: String(error?.message ?? error) }; }
  });
  handle('pdf:ai-ask', (req) => {
    if (!validRequest(req) || active.has(req.id)) throw new Error('Cerere AI invalidă.');
    if (active.size) throw new Error('Există deja o întrebare în curs.');
    const controller = new AbortController();
    active.set(req.id, controller);
    Promise.resolve(askChatGPT(req, text => emit({ id: req.id, type: 'delta', text }), controller.signal))
      .then(() => emit({ id: req.id, type: 'done' }))
      .catch(error => emit(controller.signal.aborted
        ? { id: req.id, type: 'done' }
        : { id: req.id, type: 'error', message: String(error?.message ?? error) }))
      .finally(() => active.delete(req.id));
    return { accepted: true };
  });
  handle('pdf:ai-cancel', (id) => {
    if (typeof id === 'string' && id.length < 100) active.get(id)?.abort();
    return true;
  });
}
