import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Gateway, loadConfig } from "../src/index.js";
import type { GatewayRequest, ChatMessage } from "../src/index.js";
import { GatewayError } from "../src/errors/gateway-error.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const envPath = resolve(projectRoot, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const PORT = Number(process.env.PORT) || 3170;

async function main() {
  const config = await loadConfig(resolve(__dirname));

  const gateway = new Gateway({
    config,
    onUsageLog: (log) => {
      const tag = log.success ? "OK" : "ERR";
      console.log(
        `[${tag}] ${log.provider}/${log.model} — ${log.inputTokens}+${log.outputTokens} tokens, ${log.latencyMs}ms${log.fallbackTriggered ? ` (fallback from ${log.fallbackFrom})` : ""}`,
      );
    },
  });

  console.log(`Loaded providers: ${gateway.listProviders().join(", ")}`);

  const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", providers: gateway.listProviders() }));
      return;
    }

    if (req.method === "POST" && req.url === "/v1/chat/stream") {
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body) as {
          messages: ChatMessage[];
          model?: string;
          taskType?: string;
          feature?: string;
          userTier?: string;
          maxTokens?: number;
          temperature?: number;
        };

        const request: GatewayRequest = {
          messages: parsed.messages,
          model: parsed.model,
          taskType: parsed.taskType,
          feature: parsed.feature,
          userTier: parsed.userTier,
          maxTokens: parsed.maxTokens ?? 1024,
          temperature: parsed.temperature,
          stream: true,
        };

        const streamResponse = await gateway.chatStream(request);

        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        for await (const chunk of streamResponse.stream) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        const summary = await streamResponse.getUsageSummary();
        res.write(`data: ${JSON.stringify({ type: "done", usage: summary })}\n\n`);
        res.end();
      } catch (err) {
        if (err instanceof GatewayError) {
          res.writeHead(err.httpStatus, { "Content-Type": "application/json" });
          res.end(JSON.stringify(err.toJSON()));
        } else {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            code: "INTERNAL",
            message: err instanceof Error ? err.message : "Unknown error",
          }));
        }
      }
      return;
    }

    if (req.method === "POST" && req.url === "/v1/chat") {
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body) as {
          messages: ChatMessage[];
          model?: string;
          taskType?: string;
          feature?: string;
          userTier?: string;
          maxTokens?: number;
          temperature?: number;
        };

        const request: GatewayRequest = {
          messages: parsed.messages,
          model: parsed.model,
          taskType: parsed.taskType,
          feature: parsed.feature,
          userTier: parsed.userTier,
          maxTokens: parsed.maxTokens ?? 1024,
          temperature: parsed.temperature,
        };

        const response = await gateway.chat(request);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response, null, 2));
      } catch (err) {
        if (err instanceof GatewayError) {
          res.writeHead(err.httpStatus, { "Content-Type": "application/json" });
          res.end(JSON.stringify(err.toJSON()));
        } else {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              code: "INTERNAL",
              message: err instanceof Error ? err.message : "Unknown error",
            }),
          );
        }
      }
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(PORT, () => {
    console.log(`\nai-gateway-lite demo running on http://localhost:${PORT}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST /v1/chat         — non-streaming`);
    console.log(`  POST /v1/chat/stream  — SSE streaming`);
    console.log(`  GET  /health          — health check`);
  });
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
