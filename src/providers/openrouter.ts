import type { ProviderConfig } from "../types/provider.js";
import {
  type Provider,
  type ProviderRequestOptions,
  type ProviderResult,
  type StreamResult,
  type StreamChunk,
  resolveApiKey,
  fetchProviderWithRetry,
} from "./base.js";
import { GatewayError } from "../errors/gateway-error.js";
import { parseSSEStream } from "./stream-parser.js";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 60_000;

export class OpenRouterProvider implements Provider {
  readonly name: string;
  readonly family = "openrouter";

  private readonly config: ProviderConfig;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ProviderConfig) {
    this.name = config.name;
    this.config = config;
    this.apiKey = resolveApiKey(config);
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async chat(options: ProviderRequestOptions): Promise<ProviderResult> {
    const model = options.model ?? this.config.defaultModel ?? this.config.models[0]!;

    const body = {
      model,
      messages: options.messages,
      ...(options.maxTokens != null && { max_tokens: options.maxTokens }),
      ...(options.temperature != null && { temperature: options.temperature }),
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      ...this.config.headers,
    };

    const res = await fetchProviderWithRetry(
      `${this.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: options.signal,
      },
      this.name,
      this.timeoutMs,
      this.config.retry,
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw GatewayError.fromHttpStatus(this.name, res.status, text);
    }

    const json = (await res.json()) as {
      choices: { message: { content: string } }[];
      model: string;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const choice = json.choices[0];
    return {
      content: choice?.message?.content ?? "",
      model: json.model,
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
      totalTokens: json.usage?.total_tokens ?? 0,
    };
  }

  async chatStream(options: ProviderRequestOptions): Promise<StreamResult> {
    const model = options.model ?? this.config.defaultModel ?? this.config.models[0]!;

    const body = {
      model,
      messages: options.messages,
      stream: true,
      ...(options.maxTokens != null && { max_tokens: options.maxTokens }),
      ...(options.temperature != null && { temperature: options.temperature }),
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      ...this.config.headers,
    };

    const res = await fetchProviderWithRetry(
      `${this.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: options.signal,
      },
      this.name,
      this.timeoutMs,
      this.config.retry,
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw GatewayError.fromHttpStatus(this.name, res.status, text);
    }

    if (!res.body) throw new Error("OpenRouter: no response body for stream");

    let resolvedModel = model;
    let inputTokens = 0;
    let outputTokens = 0;
    let fullContent = "";

    const rawStream = parseSSEStream(res.body);

    async function* chunks(): AsyncIterable<StreamChunk> {
      for await (const data of rawStream) {
        try {
          const parsed = JSON.parse(data) as {
            model?: string;
            choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
            usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
          };

          if (parsed.model) resolvedModel = parsed.model;

          if (parsed.usage) {
            inputTokens = parsed.usage.prompt_tokens;
            outputTokens = parsed.usage.completion_tokens;
          }

          const choice = parsed.choices?.[0];
          const delta = choice?.delta?.content ?? "";
          if (delta) fullContent += delta;

          yield {
            delta,
            model: resolvedModel,
            finishReason: choice?.finish_reason,
          };
        } catch {
          // skip unparseable chunks
        }
      }
    }

    return {
      stream: chunks(),
      getUsage: async () => ({
        content: fullContent,
        model: resolvedModel,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      }),
    };
  }
}
