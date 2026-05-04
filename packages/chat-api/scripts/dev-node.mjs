import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import worker from "../src/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(__dirname, "..");
const port = Number(process.env.PORT ?? 8787);
const env = {
  ALLOWED_ORIGINS: "http://localhost:5173,https://johnnewto.github.io",
  CHAT_BUILDER_SYSTEM_PROMPT: () => readFile(resolve(packageDir, "prompts/chat-builder-system.md"), "utf8"),
  MAX_OUTPUT_TOKENS: "8000",
  NOTEBOOK_ASSISTANT_SYSTEM_PROMPT: () => readFile(resolve(packageDir, "prompts/notebook-assistant-system.md"), "utf8"),
  OPENAI_MODEL_ALLOWLIST: "gpt-5.5,gpt-4.1,o3",
  ...process.env,
  ...(await readDevVars(resolve(packageDir, ".dev.vars")))
};

const server = createServer(async (nodeRequest, nodeResponse) => {
  try {
    const request = await toWebRequest(nodeRequest);
    const response = await worker.fetch(request, env);
    await writeWebResponse(nodeResponse, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unhandled local chat API error.";
    nodeResponse.writeHead(500, {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8"
    });
    nodeResponse.end(JSON.stringify({ error: message }));
  }
});

server.listen(port, () => {
  console.log(`SFCR chat API local server listening on http://localhost:${port}`);
  console.log(`Draft endpoint: http://localhost:${port}/v1/chat-builder/draft`);
  if (!env.OPENAI_API_KEY) {
    console.log("OPENAI_API_KEY is not set. Add packages/chat-api/.dev.vars or export it in your shell.");
  }
});

async function toWebRequest(nodeRequest) {
  const protocol = "http";
  const host = nodeRequest.headers.host ?? `localhost:${port}`;
  const url = `${protocol}://${host}${nodeRequest.url ?? "/"}`;
  const body = await readRequestBody(nodeRequest);
  const init = {
    method: nodeRequest.method,
    headers: nodeRequest.headers
  };

  if (body.length > 0 && nodeRequest.method !== "GET" && nodeRequest.method !== "HEAD") {
    init.body = body;
  }

  return new Request(url, init);
}

function readRequestBody(nodeRequest) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    nodeRequest.on("data", (chunk) => chunks.push(chunk));
    nodeRequest.on("end", () => resolveBody(Buffer.concat(chunks)));
    nodeRequest.on("error", rejectBody);
  });
}

async function writeWebResponse(nodeResponse, response) {
  nodeResponse.writeHead(response.status, Object.fromEntries(response.headers.entries()));

  if (!response.body) {
    nodeResponse.end();
    return;
  }

  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    nodeResponse.write(Buffer.from(value));
  }
  nodeResponse.end();
}

async function readDevVars(path) {
  try {
    const text = await readFile(path, "utf8");
    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const equalsIndex = line.indexOf("=");
          if (equalsIndex === -1) {
            return [line, ""];
          }

          const key = line.slice(0, equalsIndex).trim();
          const value = line.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");
          return [key, value];
        })
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}
