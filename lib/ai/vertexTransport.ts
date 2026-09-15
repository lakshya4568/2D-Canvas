/**
 * Talking to Google Vertex AI, server-side only (UPCE-MASTER-1.0 §56).
 *
 * Three things this file is careful about, in order of how much damage getting
 * them wrong would do:
 *
 *   KEYS NEVER REACH THE BROWSER. Everything here reads `process.env` and is
 *   imported only from a route handler. There is no client-side code path to
 *   this module, and `assertServerOnly` makes the mistake loud rather than
 *   silent if someone adds one.
 *
 *   AN ABSENT MODEL IS NOT AN ERROR. The whole system must pass its tests with
 *   the endpoint disabled (§57), so "not configured" is a first-class, quiet
 *   answer that callers handle by falling back to the deterministic path. It is
 *   reported precisely — WHICH variable is missing — because the most likely
 *   reader of that message is someone setting this up for the first time.
 *
 *   GOOGLE'S ERRORS ARE PASSED THROUGH VERBATIM. If the model id is wrong, the
 *   region is wrong, or the service account lacks a role, Google says so
 *   clearly; paraphrasing that into "the AI is unavailable" would throw away
 *   the only useful information in the exchange.
 *
 * Authentication supports the four ways this is actually set up in practice,
 * with no Google SDK dependency:
 *
 *   GEMINI_API_KEY                  the Generative Language endpoint
 *   VERTEX_ACCESS_TOKEN             a token from `gcloud auth print-access-token`
 *   GOOGLE_APPLICATION_CREDENTIALS  a service-account JSON, signed into a JWT
 *   ~/.config/gcloud/application_default_credentials.json
 *                                   what `gcloud auth application-default login`
 *                                   leaves behind — a refresh token, not a key
 *
 * That last one is the common case and the one worth calling out, because it is
 * a DIFFERENT credential shape: an `authorized_user`, exchanged at the token
 * endpoint with a refresh token rather than signed. A reader who only handled
 * service accounts would conclude the machine was unconfigured when it is in
 * fact logged in.
 *
 * The project id is discovered the same way: the environment first, then
 * gcloud's own config. Next.js is usually started from a launcher that never
 * sourced the user's shell profile, so an export in `.zshrc` is invisible to the
 * server process — and being unable to find a project that is plainly configured
 * is a confusing way to fail.
 */

import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export interface VertexConfig {
  project?: string;
  location: string;
  model: string;
  apiKey?: string;
  accessToken?: string;
  credentialsPath?: string;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface VertexStatus {
  configured: boolean;
  /** Which route would be used: the plain API key, or a Google Cloud project. */
  mode: "api-key" | "vertex" | "none";
  model: string;
  location: string;
  project?: string;
  /** Exactly what is missing, when nothing is configured. */
  detail: string;
}

/**
 * The model id, from the environment.
 *
 * Defaulted rather than hardcoded because model names move faster than this
 * file will. A wrong id is not guessed at or silently replaced: the request goes
 * out as configured and Google's own 404 comes back with the id in it, which is
 * the fastest possible way to find out.
 */
const DEFAULT_MODEL = "gemini-3.8-flash";
const DEFAULT_LOCATION = "global";
/**
 * Generous, because the current Gemini flash models think before they answer and
 * the thinking is charged against this budget. At 2048 a reply can come back
 * with `finishReason: MAX_TOKENS` and no content at all, which reads as "the
 * model said nothing" when it in fact never got to speak.
 */
const DEFAULT_MAX_TOKENS = 8192;
/**
 * Generous, for the same reason as the token budget: the model thinks first, and
 * a drawing with a dozen measurements takes it a while. This is a deliberate,
 * on-demand action a draftsman waits for — not something on the edit path — so
 * the cost of waiting is much lower than the cost of a timeout that throws away
 * an answer that was nearly ready.
 */
const DEFAULT_TIMEOUT_MS = 45000;

/**
 * The API host for a location.
 *
 * `global` is not a region and does not get a regional prefix: it is served from
 * `aiplatform.googleapis.com` directly. Treating it like one produces
 * `global-aiplatform.googleapis.com`, which does not resolve to the API at all —
 * the reply is an HTML 404 page rather than a JSON error, so it does not even
 * look like a Vertex problem while you are reading it.
 */
export function hostForLocation(location: string): string {
  return location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
}

/** Where `gcloud auth application-default login` puts its credential. */
function defaultAdcPath(env: Record<string, string | undefined>): string | undefined {
  const home = env.HOME || env.USERPROFILE;
  if (!home) return undefined;
  const path = `${home}/.config/gcloud/application_default_credentials.json`;
  return existsSync(path) ? path : undefined;
}

/** The project gcloud itself is set to, when the environment does not say. */
function projectFromGcloudConfig(env: Record<string, string | undefined>): string | undefined {
  const home = env.HOME || env.USERPROFILE;
  if (!home) return undefined;
  try {
    const raw = readFileSync(`${home}/.config/gcloud/configurations/config_default`, "utf8");
    const match = raw.match(/^\s*project\s*=\s*(\S+)\s*$/m);
    return match?.[1];
  } catch {
    return undefined;
  }
}

/** ADC also records the project to bill, which is the one we want. */
function projectFromAdc(path: string | undefined): string | undefined {
  if (!path) return undefined;
  try {
    const d = JSON.parse(readFileSync(path, "utf8")) as { quota_project_id?: string };
    return d.quota_project_id;
  } catch {
    return undefined;
  }
}

/** Reads from any environment-shaped object, so a test can hand one in. */
export function readVertexConfig(
  env: Record<string, string | undefined> = process.env
): VertexConfig {
  const credentialsPath = env.GOOGLE_APPLICATION_CREDENTIALS || defaultAdcPath(env);
  return {
    project:
      env.GOOGLE_CLOUD_PROJECT ||
      env.GCLOUD_PROJECT ||
      env.GCP_PROJECT ||
      projectFromAdc(credentialsPath) ||
      projectFromGcloudConfig(env),
    location: env.VERTEX_LOCATION || env.GOOGLE_CLOUD_LOCATION || DEFAULT_LOCATION,
    model: env.VERTEX_MODEL || env.GEMINI_MODEL || DEFAULT_MODEL,
    apiKey: env.GEMINI_API_KEY || env.GOOGLE_API_KEY,
    accessToken: env.VERTEX_ACCESS_TOKEN || env.GOOGLE_VERTEX_ACCESS_TOKEN,
    credentialsPath,
    maxOutputTokens: Number(env.VERTEX_MAX_TOKENS) || DEFAULT_MAX_TOKENS,
    timeoutMs: Number(env.VERTEX_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  };
}

export function vertexStatus(config: VertexConfig = readVertexConfig()): VertexStatus {
  const base = { model: config.model, location: config.location, project: config.project };

  if (config.apiKey) {
    return { ...base, configured: true, mode: "api-key", detail: "Using GEMINI_API_KEY." };
  }
  if (config.accessToken && config.project) {
    return { ...base, configured: true, mode: "vertex", detail: "Using VERTEX_ACCESS_TOKEN." };
  }
  if (config.credentialsPath && config.project) {
    // Name it for what it is. The two credential shapes live at the same path
    // and are renewed completely differently — calling a stored login a service
    // account sends someone looking for a key file that was never there.
    let kind = "credential file";
    try {
      const parsedFile = JSON.parse(readFileSync(config.credentialsPath, "utf8")) as {
        type?: string;
        client_email?: string;
      };
      kind =
        parsedFile.type === "authorized_user"
          ? `stored gcloud login (${config.project})`
          : `service account ${parsedFile.client_email ?? ""}`.trim();
    } catch {
      /* unreadable: the call itself will say so, with the real reason */
    }
    return { ...base, configured: true, mode: "vertex", detail: `Using the ${kind}.` };
  }

  // Say which HALF is missing. "Not configured" when the machine is logged in
  // but the project is unknown sends someone to re-run a login they already did.
  const detail = !config.project
    ? config.credentialsPath || config.accessToken
      ? "Signed in, but no project. Run `gcloud config set project <id>`, or set GOOGLE_CLOUD_PROJECT."
      : "No project and no credentials. Run `gcloud auth application-default login` and `gcloud config set project <id>`, or set GEMINI_API_KEY."
    : "A project is set but there are no credentials. Run `gcloud auth application-default login`.";

  return {
    ...base,
    configured: false,
    mode: "none",
    detail: `${detail} The drawing works without it; suggestions come from the deterministic reader instead.`,
  };
}

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "vertexTransport is server-only: importing it into client code would ship credentials to the browser."
    );
  }
}

// ---------------------------------------------------------------------------
// Service-account JWT -> access token, with no SDK
// ---------------------------------------------------------------------------

interface ServiceAccount {
  type?: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/** What `gcloud auth application-default login` writes: a refresh token. */
interface AuthorizedUser {
  type: "authorized_user";
  client_id: string;
  client_secret: string;
  refresh_token: string;
  quota_project_id?: string;
}

const base64url = (input: Buffer | string): string =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Mints an access token from a service-account key.
 *
 * RS256 over the standard Google assertion claims, exchanged at the token
 * endpoint. Cached until a minute before expiry, because the exchange is a
 * network round trip and the whole point of this agent is that it is optional
 * and cheap.
 */
async function tokenFromCredentialFile(path: string, timeoutMs: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.token;

  const raw = readFileSync(path, "utf8");
  const parsedFile = JSON.parse(raw) as ServiceAccount | AuthorizedUser;

  // Two different credential shapes live at this path depending on how the
  // machine was set up, and they are exchanged in completely different ways.
  if ((parsedFile as AuthorizedUser).type === "authorized_user") {
    const user = parsedFile as AuthorizedUser;
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: user.client_id,
        client_secret: user.client_secret,
        refresh_token: user.refresh_token,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `Google refused the stored login: ${res.status} ${text}. Run \`gcloud auth application-default login\` to renew it.`
      );
    }
    const out = JSON.parse(text) as { access_token?: string; expires_in?: number };
    if (!out.access_token) throw new Error(`No access_token in the token response: ${text}`);
    cachedToken = { token: out.access_token, expiresAt: now + (out.expires_in ?? 3600) };
    return out.access_token;
  }

  const sa = parsedFile as ServiceAccount;
  if (!sa.client_email || !sa.private_key) {
    throw new Error(`${path} is neither a service-account key nor a stored login.`);
  }

  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = base64url(signer.sign(sa.private_key));
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const body = await res.text();
  if (!res.ok) throw new Error(`Google refused the service-account assertion: ${res.status} ${body}`);

  const parsed = JSON.parse(body) as { access_token?: string; expires_in?: number };
  if (!parsed.access_token) throw new Error(`No access_token in the token response: ${body}`);

  cachedToken = { token: parsed.access_token, expiresAt: now + (parsed.expires_in ?? 3600) };
  return parsed.access_token;
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

export interface GenerateRequest {
  systemPrompt: string;
  /** The abstracted payload. Never geometry, never coordinates. */
  payload: unknown;
  /** Response schema Google will constrain the output to. */
  schema: unknown;
  signal?: AbortSignal;
}

/**
 * One structured-output call. Returns the model's raw JSON text.
 *
 * Temperature is zero: this is a classification job over measurements, and a
 * different answer on a second run of the same drawing would be a defect, not
 * creativity.
 */
export async function generateJson(
  request: GenerateRequest,
  config: VertexConfig = readVertexConfig()
): Promise<string> {
  assertServerOnly();
  const status = vertexStatus(config);
  if (!status.configured) throw new Error(status.detail);

  const generationConfig = {
    temperature: 0,
    responseMimeType: "application/json",
    responseSchema: request.schema,
    maxOutputTokens: config.maxOutputTokens,
  };

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: request.systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(request.payload) }] }],
    generationConfig,
  });

  let url: string;
  const headers: Record<string, string> = { "content-type": "application/json" };

  if (status.mode === "api-key") {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
  } else {
    const token =
      config.accessToken ??
      (await tokenFromCredentialFile(config.credentialsPath!, config.timeoutMs));
    headers.authorization = `Bearer ${token}`;
    // Without this, a user credential is billed to no project and the call is
    // refused for "insufficient authentication scopes" — which sounds like a
    // permissions problem and is actually a missing header.
    if (config.project) headers["x-goog-user-project"] = config.project;
    url =
      `https://${hostForLocation(config.location)}/v1/projects/${config.project}` +
      `/locations/${config.location}/publishers/google/models/${config.model}:generateContent`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: request.signal ?? AbortSignal.timeout(config.timeoutMs),
    });
  } catch (err) {
    // "The operation was aborted due to timeout" says nothing about what to do.
    const aborted = err instanceof Error && /abort|timeout/i.test(err.message);
    if (aborted) {
      throw new Error(
        `${config.model} did not answer within ${(config.timeoutMs / 1000).toFixed(
          0
        )}s. Raise VERTEX_TIMEOUT_MS, or try again — a drawing with many measurements takes it longer.`
      );
    }
    throw err;
  }

  const text = await res.text();
  if (!res.ok) {
    // Verbatim. A wrong model id, a wrong region and a missing IAM role all look
    // identical once paraphrased, and all three are one-line fixes when not.
    throw new Error(`Vertex returned ${res.status}: ${text}`);
  }

  const parsed = JSON.parse(text) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: { totalTokenCount?: number };
  };
  const candidate = parsed.candidates?.[0];
  const out = candidate?.content?.parts?.[0]?.text;

  if (!out) {
    // Naming this case is worth the lines. A thinking model that runs out of
    // budget returns a well-formed response with no content and
    // `finishReason: MAX_TOKENS`, and "no content in the model response" sends
    // the reader looking for a parsing bug that is not there.
    if (candidate?.finishReason === "MAX_TOKENS") {
      throw new Error(
        `The model used its whole ${config.maxOutputTokens}-token budget thinking and never answered. Raise VERTEX_MAX_TOKENS.`
      );
    }
    throw new Error(`No content in the model response: ${text.slice(0, 400)}`);
  }
  return out;
}
