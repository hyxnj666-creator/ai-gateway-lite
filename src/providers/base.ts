import type { ChatMessage } from "../types/gateway.js";
import type { ProviderConfig, ProviderRetry } from "../types/provider.js";
import { GatewayError } from "../errors/gateway-error.js";

export interface ProviderRequestOptions {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  signal?: AbortSignal;
}

export interface ProviderResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface StreamChunk {
  delta: string;
  model?: string;
  finishReason?: string | null;
}

export interface StreamResult {
  stream: AsyncIterable<StreamChunk>;
  getUsage: () => Promise<ProviderResult>;
}

export interface Provider {
  readonly name: string;
  readonly family: string;
  chat(options: ProviderRequestOptions): Promise<ProviderResult>;
  chatStream?(options: ProviderRequestOptions): Promise<StreamResult>;
}

export function resolveApiKey(config: ProviderConfig): string {
  const envVar = config.auth.envVar;
  if (!envVar) {
    throw new Error(
      `Provider "${config.name}": auth.envVar is required for type "${config.auth.type}"`,
    );
  }
  const value = process.env[envVar];
  if (!value) {
    throw new Error(
      `Provider "${config.name}": environment variable ${envVar} is not set`,
    );
  }
  return value;
}

export function buildHeaders(
  config: ProviderConfig,
  apiKey: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...config.headers,
  };

  switch (config.auth.type) {
    case "apiKey":
    case "bearer":
      headers["Authorization"] = `Bearer ${apiKey}`;
      break;
    case "customHeader":
      if (config.auth.headerName) {
        headers[config.auth.headerName] = apiKey;
      }
      break;
  }

  return headers;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const existing = init.signal;

  if (existing) {
    existing.addEventListener("abort", () => controller.abort(existing.reason));
  }

  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchProviderWithRetry(
  url: string,
  init: RequestInit,
  providerName: string,
  timeoutMs: number,
  retry?: ProviderRetry,
): Promise<Response> {
  const maxAttempts = retry?.maxAttempts ?? 1;
  const baseBackoffMs = retry?.backoffMs ?? 500;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);

      if (res.ok || !isRetryableStatus(res.status) || attempt === maxAttempts - 1) {
        return res;
      }

      lastError = new Error(`${providerName} ${res.status}`);
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err) || attempt === maxAttempts - 1) {
        throw err;
      }
    }

    const jitter = Math.random() * 0.3 + 0.85;
    await sleep(baseBackoffMs * Math.pow(2, attempt) * jitter);
  }

  throw lastError;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof GatewayError) return err.retryable;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("timeout") || msg.includes("aborted") || msg.includes("ECONNRESET");
}
