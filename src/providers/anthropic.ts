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

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_TIMEOUT_MS = 60_000;
const ANTHROPIC_VERSION = "2023-06-01";

export class AnthropicProvider implements Provider {
  readonly name: string;
  readonly family = "anthropic";

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

    const systemMessage = options.messages.find((m) => m.role === "system");
    const nonSystemMessages = options.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model,
      messages: nonSystemMessages,
      max_tokens: options.maxTokens ?? 4096,
      ...(options.temperature != null && { temperature: options.temperature }),
      ...(systemMessage && { system: systemMessage.content }),
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      ...this.config.headers,
    };

    const res = await fetchProviderWithRetry(
      `${this.baseUrl}/v1/messages`,
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
      content: { type: string; text: string }[];
      model: string;
      usage: { input_tokens: number; output_tokens: number };
    };

    const textBlock = json.content.find((b) => b.type === "text");
    const inputTokens = json.usage.input_tokens;
    const outputTokens = json.usage.output_tokens;

    return {
      content: textBlock?.text ?? "",
      model: json.model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
  }

  async chatStream(options: ProviderRequestOptions): Promise<StreamResult> {
    const model = options.model ?? this.config.defaultModel ?? this.config.models[0]!;

    const systemMessage = options.messages.find((m) => m.role === "system");
    const nonSystemMessages = options.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model,
      messages: nonSystemMessages,
      max_tokens: options.maxTokens ?? 4096,
      stream: true,
      ...(options.temperature != null && { temperature: options.temperature }),
      ...(systemMessage && { system: systemMessage.content }),
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      ...this.config.headers,
    };

    const res = await fetchProviderWithRetry(
      `${this.baseUrl}/v1/messages`,
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

    if (!res.body) throw new Error("Anthropic: no response body for stream");

    let resolvedModel = model;
    let inputTokens = 0;
    let outputTokens = 0;
    let fullContent = "";

    const rawStream = parseSSEStream(res.body);

    async function* chunks(): AsyncIterable<StreamChunk> {
      for await (const data of rawStream) {
        try {
          const event = JSON.parse(data) as {
            type: string;
            message?: { model?: string; usage?: { input_tokens: number } };
            delta?: { text?: string; stop_reason?: string };
            usage?: { output_tokens: number };
          };

          if (event.type === "message_start" && event.message) {
            if (event.message.model) resolvedModel = event.message.model;
            if (event.message.usage) inputTokens = event.message.usage.input_tokens;
          }

          if (event.type === "content_block_delta" && event.delta?.text) {
            fullContent += event.delta.text;
            yield { delta: event.delta.text, model: resolvedModel };
          }

          if (event.type === "message_delta") {
            if (event.usage) outputTokens = event.usage.output_tokens;
            yield {
              delta: "",
              model: resolvedModel,
              finishReason: event.delta?.stop_reason ?? null,
            };
          }
        } catch {
          // skip unparseable events
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
