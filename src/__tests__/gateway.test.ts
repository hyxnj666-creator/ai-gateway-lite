import { describe, it, expect, vi } from "vitest";
import { Gateway } from "../gateway.js";
import { GatewayError } from "../errors/gateway-error.js";
import type { GatewayConfig } from "../config/loader.js";
import type { GatewayRequest } from "../types/gateway.js";
import type { UsageLog } from "../types/usage-log.js";
import type { Provider, ProviderResult } from "../providers/base.js";

function mockProviderFactory(name: string, result?: Partial<ProviderResult>, error?: Error) {
  const provider: Provider = {
    name,
    family: "mock",
    chat: error
      ? vi.fn().mockRejectedValue(error)
      : vi.fn().mockResolvedValue({
          content: "hello from mock",
          model: "mock-model",
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          ...result,
        }),
  };
  return () => provider;
}

function buildConfig(overrides?: Partial<GatewayConfig>): GatewayConfig {
  return {
    providers: [
      {
        name: "mock-provider",
        provider: "mock",
        models: ["mock-model"],
        auth: { type: "none" },
      },
    ],
    routes: [
      {
        name: "default",
        priority: 0,
        match: {},
        target: { provider: "mock-provider", model: "mock-model" },
      },
    ],
    fallbackChains: [],
    budgets: [],
    ...overrides,
  };
}

const baseRequest: GatewayRequest = {
  messages: [{ role: "user", content: "Hello" }],
};

describe("Gateway", () => {
  it("completes a basic chat request", async () => {
    const gateway = new Gateway({
      config: buildConfig(),
      customProviders: { mock: mockProviderFactory("mock-provider") },
    });

    const res = await gateway.chat(baseRequest);
    expect(res.content).toBe("hello from mock");
    expect(res.provider).toBe("mock-provider");
    expect(res.model).toBe("mock-model");
    expect(res.inputTokens).toBe(10);
    expect(res.outputTokens).toBe(5);
    expect(res.totalTokens).toBe(15);
    expect(res.fallbackTriggered).toBe(false);
    expect(res.requestId).toBeTruthy();
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("calls onUsageLog handler", async () => {
    const logs: UsageLog[] = [];
    const gateway = new Gateway({
      config: buildConfig(),
      customProviders: { mock: mockProviderFactory("mock-provider") },
      onUsageLog: (log) => { logs.push(log); },
    });

    await gateway.chat(baseRequest);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.success).toBe(true);
    expect(logs[0]!.provider).toBe("mock-provider");
    expect(logs[0]!.routeRule).toBe("default");
  });

  it("throws GatewayError when no route matches", async () => {
    const gateway = new Gateway({
      config: buildConfig({
        routes: [
          {
            name: "specific",
            priority: 100,
            match: { taskType: "nope" },
            target: { provider: "mock-provider" },
          },
        ],
      }),
      customProviders: { mock: mockProviderFactory("mock-provider") },
    });

    await expect(gateway.chat(baseRequest)).rejects.toThrow(GatewayError);
    try {
      await gateway.chat(baseRequest);
    } catch (err) {
      expect(err).toBeInstanceOf(GatewayError);
      expect((err as GatewayError).kind).toBe("route_not_found");
    }
  });

  it("logs error when provider fails", async () => {
    const logs: UsageLog[] = [];
    const gateway = new Gateway({
      config: buildConfig(),
      customProviders: { mock: mockProviderFactory("mock-provider", undefined, new Error("boom")) },
      onUsageLog: (log) => { logs.push(log); },
    });

    await expect(gateway.chat(baseRequest)).rejects.toThrow("boom");
    expect(logs).toHaveLength(1);
    expect(logs[0]!.success).toBe(false);
    expect(logs[0]!.errorCode).toBe("UNKNOWN");
  });

  it("enforces hard budget after accumulation", async () => {
    const gateway = new Gateway({
      config: buildConfig({
        budgets: [{
          name: "tight-daily",
          scope: { type: "global" },
          window: "day",
          limits: { maxTotalTokens: 20 },
          enforcement: "hard",
        }],
      }),
      customProviders: { mock: mockProviderFactory("mock-provider") },
    });

    // First request uses 15 tokens, within limit
    await gateway.chat(baseRequest);

    // Second request would push total to 30, exceeding 20 limit
    // Budget check happens before the call with estimated 0,
    // but record() after first call accumulates the real usage.
    // The pre-check sees accumulated 15 + pending 0 = 15, still under 20,
    // so second call also succeeds. After 2 calls, accumulated = 30.
    await gateway.chat(baseRequest);

    // Third request: accumulated is 30, pending 0 = 30 > 20, should block
    await expect(gateway.chat(baseRequest)).rejects.toThrow(GatewayError);
  });

  it("listProviders returns registered names", () => {
    const gateway = new Gateway({
      config: buildConfig(),
      customProviders: { mock: mockProviderFactory("mock-provider") },
    });
    expect(gateway.listProviders()).toEqual(["mock-provider"]);
  });

  it("routes by taskType", async () => {
    const factory1 = mockProviderFactory("p1", { content: "from-p1" });
    const factory2 = mockProviderFactory("p2", { content: "from-p2" });

    const gateway = new Gateway({
      config: {
        providers: [
          { name: "p1", provider: "f1", models: ["m"], auth: { type: "none" } },
          { name: "p2", provider: "f2", models: ["m"], auth: { type: "none" } },
        ],
        routes: [
          { name: "complex", priority: 100, match: { taskType: "complex" }, target: { provider: "p1" } },
          { name: "default", priority: 0, match: {}, target: { provider: "p2" } },
        ],
        fallbackChains: [],
        budgets: [],
      },
      customProviders: { f1: factory1, f2: factory2 },
    });

    const res1 = await gateway.chat({ ...baseRequest, taskType: "complex" });
    expect(res1.content).toBe("from-p1");

    const res2 = await gateway.chat({ ...baseRequest, taskType: "simple" });
    expect(res2.content).toBe("from-p2");
  });
});
