import { getBundledChatBuilderSystemPrompt } from "./chatBuilderSystemPrompt.ts";

interface Env {
  ALLOWED_ORIGINS?: string;
  BETA_PASSWORD?: string;
  CHAT_BUILDER_SYSTEM_PROMPT?: string | (() => string | Promise<string>);
  CHAT_BUILDER_RATE_LIMITER?: RateLimitBinding;
  MAX_OUTPUT_TOKENS?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL_ALLOWLIST?: string;
}

interface RateLimitBinding {
  limit(args: { key: string }): Promise<{ success: boolean }>;
}

interface ChatMessage {
  role: "assistant" | "user";
  text: string;
}

interface ChatDraftRequest {
  betaPassword?: unknown;
  discoveryUrl?: unknown;
  messages?: unknown;
  model?: unknown;
  prompt?: unknown;
}

interface SfcrDiscoveryIndex {
  resources?: {
    notebooks?: {
      examples?: Array<{ id?: string; url?: string }>;
      guide?: string;
      manifest?: string;
      prompt?: string;
      schema?: string;
    };
  };
}

interface SfcrNotebookManifest {
  examples?: Array<{ id?: string; label?: string; url?: string }>;
  guideUrl?: string;
  promptUrl?: string;
  schemaUrl?: string;
}

const DEFAULT_ALLOWED_MODELS = ["gpt-5.5", "gpt-4.1", "o3"];
const DEFAULT_MAX_OUTPUT_TOKENS = 8000;
const MAX_PROMPT_LENGTH = 12000;
const MAX_MESSAGE_COUNT = 12;
const MAX_MESSAGE_LENGTH = 8000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  }
};

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const corsHeaders = buildCorsHeaders(request, env);

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  if (url.pathname !== "/v1/chat-builder/draft") {
    return jsonResponse({ error: "Not found." }, 404, corsHeaders);
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, corsHeaders);
  }

  if (!corsHeaders["Access-Control-Allow-Origin"]) {
    return jsonResponse({ error: "Origin is not allowed." }, 403, corsHeaders);
  }

  let payload: ChatDraftRequest;
  try {
    payload = (await request.json()) as ChatDraftRequest;
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400, corsHeaders);
  }

  if (!isBetaPasswordAllowed(payload, env)) {
    return jsonResponse({ error: "Beta password is required." }, 403, corsHeaders);
  }

  const rateLimitResponse = await enforceChatBuilderRateLimit(request, env, corsHeaders);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (!env.OPENAI_API_KEY) {
    return jsonResponse({ error: "OPENAI_API_KEY is not configured." }, 500, corsHeaders);
  }

  const validation = validateDraftRequest(payload, env);
  if ("error" in validation) {
    return jsonResponse({ error: validation.error }, 400, corsHeaders);
  }

  try {
    const systemPrompt = await resolveChatBuilderSystemPrompt(env);
    const resourceBundle = await loadChatBuilderResourceBundle(validation.discoveryUrl);
    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: validation.model,
        max_output_tokens: resolveMaxOutputTokens(env),
        store: false,
        stream: true,
        instructions: `${systemPrompt.trim()}\n\n${resourceBundle}`,
        input: [
          ...validation.messages.map((message) => ({
            role: message.role,
            content: message.text
          })),
          {
            role: "user",
            content: validation.prompt
          }
        ]
      })
    });

    if (!openAiResponse.ok || !openAiResponse.body) {
      return jsonResponse(
        { error: await readOpenAiError(openAiResponse) },
        openAiResponse.status || 502,
        corsHeaders
      );
    }

    return new Response(openAiResponse.body, {
      status: openAiResponse.status,
      headers: {
        ...corsHeaders,
        "Cache-Control": "no-store",
        "Content-Type": openAiResponse.headers.get("Content-Type") ?? "text/event-stream; charset=utf-8"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create chat draft.";
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
}

function isBetaPasswordAllowed(payload: ChatDraftRequest, env: Env): boolean {
  const configuredPassword = env.BETA_PASSWORD?.trim();
  if (!configuredPassword) {
    return true;
  }

  return typeof payload.betaPassword === "string" && payload.betaPassword === configuredPassword;
}

async function enforceChatBuilderRateLimit(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response | null> {
  if (!env.CHAT_BUILDER_RATE_LIMITER) {
    return null;
  }

  const key =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("Origin") ??
    "anonymous";
  const { success } = await env.CHAT_BUILDER_RATE_LIMITER.limit({ key });
  if (success) {
    return null;
  }

  return jsonResponse({ error: "Rate limit exceeded. Please wait before trying again." }, 429, {
    ...corsHeaders,
    "Retry-After": "60"
  });
}

function resolveMaxOutputTokens(env: Env): number {
  const configured = Number(env.MAX_OUTPUT_TOKENS);
  if (Number.isInteger(configured) && configured > 0) {
    return configured;
  }

  return DEFAULT_MAX_OUTPUT_TOKENS;
}

async function resolveChatBuilderSystemPrompt(env: Env): Promise<string> {
  if (typeof env.CHAT_BUILDER_SYSTEM_PROMPT === "function") {
    const prompt = await env.CHAT_BUILDER_SYSTEM_PROMPT();
    if (prompt.trim() !== "") {
      return prompt;
    }
  }

  if (typeof env.CHAT_BUILDER_SYSTEM_PROMPT === "string" && env.CHAT_BUILDER_SYSTEM_PROMPT.trim() !== "") {
    return env.CHAT_BUILDER_SYSTEM_PROMPT;
  }

  return getBundledChatBuilderSystemPrompt();
}

function buildCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowedOrigins = parseList(env.ALLOWED_ORIGINS);
  const allowAnyOrigin = allowedOrigins.length === 0;
  const allowedOrigin = allowAnyOrigin || allowedOrigins.includes(origin) ? origin : "";

  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "OPTIONS, POST",
    "Vary": "Origin"
  };
}

function validateDraftRequest(
  payload: ChatDraftRequest,
  env: Env
):
  | {
      discoveryUrl: string;
      messages: ChatMessage[];
      model: string;
      prompt: string;
    }
  | { error: string } {
  if (typeof payload.model !== "string" || payload.model.trim() === "") {
    return { error: "model is required." };
  }

  const model = payload.model.trim();
  const allowedModels = parseList(env.OPENAI_MODEL_ALLOWLIST);
  const modelAllowlist = allowedModels.length > 0 ? allowedModels : DEFAULT_ALLOWED_MODELS;
  if (!modelAllowlist.includes(model)) {
    return { error: "model is not allowed." };
  }

  if (typeof payload.prompt !== "string" || payload.prompt.trim() === "") {
    return { error: "prompt is required." };
  }

  const prompt = payload.prompt.trim();
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return { error: `prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.` };
  }

  if (typeof payload.discoveryUrl !== "string" || payload.discoveryUrl.trim() === "") {
    return { error: "discoveryUrl is required." };
  }

  let discoveryUrl: URL;
  try {
    discoveryUrl = new URL(payload.discoveryUrl);
  } catch {
    return { error: "discoveryUrl must be a valid URL." };
  }

  if (!["http:", "https:"].includes(discoveryUrl.protocol)) {
    return { error: "discoveryUrl must use http or https." };
  }

  if (!Array.isArray(payload.messages)) {
    return { error: "messages must be an array." };
  }

  if (payload.messages.length > MAX_MESSAGE_COUNT) {
    return { error: `messages must include ${MAX_MESSAGE_COUNT} items or fewer.` };
  }

  const messages: ChatMessage[] = [];
  for (const message of payload.messages) {
    if (!isRecord(message)) {
      return { error: "messages must contain objects." };
    }
    if (message.role !== "assistant" && message.role !== "user") {
      return { error: "message role must be assistant or user." };
    }
    if (typeof message.text !== "string") {
      return { error: "message text must be a string." };
    }
    if (message.text.length > MAX_MESSAGE_LENGTH) {
      return { error: `message text must be ${MAX_MESSAGE_LENGTH} characters or fewer.` };
    }
    messages.push({ role: message.role, text: message.text });
  }

  return {
    discoveryUrl: discoveryUrl.toString(),
    messages,
    model,
    prompt
  };
}

async function loadChatBuilderResourceBundle(discoveryUrl: string): Promise<string> {
  const discovery = await fetchJsonResource<SfcrDiscoveryIndex>(discoveryUrl);
  const notebookResources = discovery.resources?.notebooks;

  if (!notebookResources?.manifest || !notebookResources.guide || !notebookResources.schema || !notebookResources.prompt) {
    throw new Error("SFCR discovery index is missing notebook resources.");
  }

  const manifestUrl = resolveDocumentResourceUrl(discoveryUrl, notebookResources.manifest);
  const guideUrl = resolveDocumentResourceUrl(discoveryUrl, notebookResources.guide);
  const schemaUrl = resolveDocumentResourceUrl(discoveryUrl, notebookResources.schema);
  const promptUrl = resolveDocumentResourceUrl(discoveryUrl, notebookResources.prompt);

  const notebookManifest = await fetchJsonResource<SfcrNotebookManifest>(manifestUrl);
  const exampleUrls = [
    ...(notebookManifest.examples
      ?.map((example) => (example.url ? resolveDocumentResourceUrl(manifestUrl, example.url) : null))
      .filter((url): url is string => Boolean(url)) ?? []),
    ...(notebookResources.examples
      ?.map((example) => (example.url ? resolveDocumentResourceUrl(discoveryUrl, example.url) : null))
      .filter((url): url is string => Boolean(url)) ?? [])
  ].filter((url, index, all) => all.indexOf(url) === index);

  const [guideText, schemaText, promptText, ...exampleTexts] = await Promise.all([
    fetchTextResource(guideUrl),
    fetchTextResource(schemaUrl),
    fetchTextResource(promptUrl),
    ...exampleUrls.map((url) => fetchTextResource(url))
  ]);

  return [
    "SFCR discovery bundle:",
    JSON.stringify(discovery, null, 2),
    "\nNotebook manifest:",
    JSON.stringify(notebookManifest, null, 2),
    "\nNotebook guide:",
    guideText,
    "\nNotebook schema:",
    schemaText,
    "\nNotebook generation prompt:",
    promptText,
    ...exampleTexts.map((exampleText, index) => `\nNotebook example ${index + 1}:\n${exampleText}`)
  ].join("\n");
}

async function fetchJsonResource<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }

  return (await response.json()) as T;
}

async function fetchTextResource(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }

  return response.text();
}

function resolveDocumentResourceUrl(baseUrl: string, resourceUrl: string): string {
  try {
    return new URL(resourceUrl, baseUrl).toString();
  } catch {
    return resourceUrl;
  }
}

async function readOpenAiError(response: Response): Promise<string> {
  try {
    const error = (await response.json()) as { error?: { message?: string } };
    return error.error?.message ?? "OpenAI request failed.";
  } catch {
    return "OpenAI request failed.";
  }
}

function jsonResponse(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
