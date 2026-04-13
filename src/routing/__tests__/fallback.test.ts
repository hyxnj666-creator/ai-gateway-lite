import { describe, it, expect, vi } from "vitest";
import { executeWithFallback } from "../fallback.js";
import { ProviderRegistry } from "../../providers/registry.js";
import { GatewayError } from "../../errors/gateway-error.js";
import type { Provider, ProviderRequestOptions, ProviderResult } from "../../providers/base.js";
import type { FallbackChain } from "../../types/fallback.js";

function mockProvider(name: string, result?: Partial<ProviderResult>, error?: Error): Provider {
  return {
    name,
    family: "mock",
    chat: error
      ? vi.fn().mockRejectedValue(error)
      : vi.fn().mockResolvedValue({
          content: "ok",
          model: "mock-model",
          inputTokens: 5,
          outputTokens: 3,
          totalTokens: 8,
          ...result,
        }),
  };
}

function buildRegistry(providers: Provider[]): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.registerFactory("mock", () => {
    throw new Error("should not be called");
  });
  for (const p of providers) {
    // Directly set via load with a matching factory
    registry.registerFactory(p.name, () => p);
    registry.load([{
      name: p.name,
      provider: p.name,
      models: ["m"],
      auth: { type: "none" },
    }]);
  }
  return registry;
}

const baseOpts: ProviderRequestOptions = {
  model: "test-model",
  messages: [{ role: "user", content: "hi" }],
};

describe("executeWithFallback", () => {
  it("returns first provider result when it succeeds", async () => {
    const p1 = mockProvider("p1");
    const p2 = mockProvider("p2");
    const registry = buildRegistry([p1, p2]);

    const chain: FallbackChain = {
      name: "chain",
      steps: [{ provider: "p1" }, { provider: "p2" }],
    };

    const result = await executeWithFallback(chain, registry, baseOpts);
    expect(result.provider.name).toBe("p1");
    expect(result.fallbackTriggered).toBe(false);
    expect(p2.chat).not.toHaveBeenCalled();
  });

  it("falls back to second provider on error", async () => {
    const p1 = mockProvider("p1", undefined, new Error("timeout"));
    const p2 = mockProvider("p2", { content: "fallback-response" });
    const registry = buildRegistry([p1, p2]);

    const chain: FallbackChain = {
      name: "chain",
      steps: [
        { provider: "p1" },
        { provider: "p2", when: ["timeout", "provider_error"] },
      ],
    };

    const result = await executeWithFallback(chain, registry, baseOpts);
    expect(result.provider.name).toBe("p2");
    expect(result.fallbackTriggered).toBe(true);
    expect(result.fallbackFrom).toBe("p1");
    expect(result.result.content).toBe("fallback-response");
  });

  it("does not fallback when trigger does not match 'when'", async () => {
    const p1 = mockProvider("p1", undefined, new Error("timeout"));
    const p2 = mockProvider("p2");
    const registry = buildRegistry([p1, p2]);

    const chain: FallbackChain = {
      name: "chain",
      steps: [
        { provider: "p1" },
        { provider: "p2", when: ["rate_limit"] },
      ],
    };

    await expect(executeWithFallback(chain, registry, baseOpts)).rejects.toThrow("timeout");
    expect(p2.chat).not.toHaveBeenCalled();
  });

  it("falls back on GatewayError with correct classification", async () => {
    const p1 = mockProvider("p1", undefined, GatewayError.providerRateLimit("p1"));
    const p2 = mockProvider("p2");
    const registry = buildRegistry([p1, p2]);

    const chain: FallbackChain = {
      name: "chain",
      steps: [
        { provider: "p1" },
        { provider: "p2", when: ["rate_limit"] },
      ],
    };

    const result = await executeWithFallback(chain, registry, baseOpts);
    expect(result.provider.name).toBe("p2");
    expect(result.fallbackTriggered).toBe(true);
  });

  it("throws when all steps fail", async () => {
    const p1 = mockProvider("p1", undefined, new Error("fail-1"));
    const p2 = mockProvider("p2", undefined, new Error("fail-2"));
    const registry = buildRegistry([p1, p2]);

    const chain: FallbackChain = {
      name: "chain",
      steps: [{ provider: "p1" }, { provider: "p2" }],
    };

    await expect(executeWithFallback(chain, registry, baseOpts)).rejects.toThrow("fail-2");
  });

  it("uses step model override", async () => {
    const p1 = mockProvider("p1");
    const registry = buildRegistry([p1]);

    const chain: FallbackChain = {
      name: "chain",
      steps: [{ provider: "p1", model: "override-model" }],
    };

    await executeWithFallback(chain, registry, baseOpts);
    expect(p1.chat).toHaveBeenCalledWith(
      expect.objectContaining({ model: "override-model" }),
    );
  });
});
