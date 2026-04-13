import { describe, it, expect, vi } from "vitest";
import { Gateway } from "../gateway.js";
import type { GatewayConfig } from "../config/loader.js";
import type { GatewayRequest, GatewayStreamChunk } from "../types/gateway.js";
import type { Provider, ProviderResult, StreamResult, StreamChunk } from "../providers/base.js";

function mockStreamProvider(
  name: string,
  textChunks: string[],
  usage: Partial<ProviderResult> = {},
): () => Provider {
  return () => ({
    name,
    family: "mock",
    chat: vi.fn().mockResolvedValue({
      content: textChunks.join(""),
      model: "mock-model",
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      ...usage,
    }),
    chatStream: vi.fn().mockImplementation(async (): Promise<StreamResult> => {
      async function* gen(): AsyncIterable<StreamChunk> {
        for (const text of textChunks) {
          yield { delta: text, model: "mock-model" };
        }
        yield { delta: "", model: "mock-model", finishReason: "stop" };
      }
      return {
        stream: gen(),
        getUsage: async () => ({
          content: textChunks.join(""),
          model: "mock-model",
          inputTokens: usage.inputTokens ?? 10,
          outputTokens: usage.outputTokens ?? 5,
          totalTokens: usage.totalTokens ?? 15,
        }),
      };
    }),
  });
}

function buildConfig(overrides?: Partial<GatewayConfig>): GatewayConfig {
  return {
    providers: [
      { name: "mock-provider", provider: "mock", models: ["mock-model"], auth: { type: "none" } },
    ],
    routes: [
      { name: "default", priority: 0, match: {}, target: { provider: "mock-provider", model: "mock-model" } },
    ],
    fallbackChains: [],
    budgets: [],
    ...overrides,
  };
}

const baseRequest: GatewayRequest = {
  messages: [{ role: "user", content: "Hello" }],
  stream: true,
};

describe("Gateway.chatStream", () => {
  it("streams chunks and returns usage summary", async () => {
    const gateway = new Gateway({
      config: buildConfig(),
      customProviders: { mock: mockStreamProvider("mock-provider", ["Hello", " ", "world"]) },
    });

    const response = await gateway.chatStream(baseRequest);
    expect(response.requestId).toBeTruthy();

    const collected: GatewayStreamChunk[] = [];
    for await (const chunk of response.stream) {
      collected.push(chunk);
    }

    expect(collected.length).toBe(4);
    expect(collected[0]!.delta).toBe("Hello");
    expect(collected[1]!.delta).toBe(" ");
    expect(collected[2]!.delta).toBe("world");
    expect(collected[3]!.finishReason).toBe("stop");

    const summary = await response.getUsageSummary();
    expect(summary.content).toBe("Hello world");
    expect(summary.provider).toBe("mock-provider");
    expect(summary.inputTokens).toBe(10);
    expect(summary.outputTokens).toBe(5);
    expect(summary.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("each chunk carries requestId and provider", async () => {
    const gateway = new Gateway({
      config: buildConfig(),
      customProviders: { mock: mockStreamProvider("mock-provider", ["hi"]) },
    });

    const response = await gateway.chatStream(baseRequest);
    for await (const chunk of response.stream) {
      expect(chunk.requestId).toBe(response.requestId);
      expect(chunk.provider).toBe("mock-provider");
    }
  });

  it("logs usage after getUsageSummary", async () => {
    const logs: unknown[] = [];
    const gateway = new Gateway({
      config: buildConfig(),
      customProviders: { mock: mockStreamProvider("mock-provider", ["a"]) },
      onUsageLog: (log) => { logs.push(log); },
    });

    const response = await gateway.chatStream(baseRequest);
    for await (const _chunk of response.stream) { /* consume */ }
    await response.getUsageSummary();

    expect(logs).toHaveLength(1);
  });
});
