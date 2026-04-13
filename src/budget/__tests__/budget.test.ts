import { describe, it, expect } from "vitest";
import { BudgetTracker } from "../tracker.js";
import { BudgetGuard } from "../guard.js";
import { GatewayError } from "../../errors/gateway-error.js";
import type { BudgetPolicy } from "../../types/budget.js";
import type { GatewayRequest } from "../../types/gateway.js";

const baseRequest: GatewayRequest = {
  messages: [{ role: "user", content: "hi" }],
};

// --- BudgetTracker ---

describe("BudgetTracker", () => {
  it("allows when no limits defined", () => {
    const tracker = new BudgetTracker();
    const policy: BudgetPolicy = {
      name: "open",
      scope: { type: "global" },
      window: "day",
      enforcement: "hard",
    };
    const result = tracker.check(policy, "global", { inputTokens: 100, outputTokens: 50, costUsd: 0.01 });
    expect(result.allowed).toBe(true);
    expect(result.warn).toBe(false);
  });

  it("blocks when total tokens exceed hard limit", () => {
    const tracker = new BudgetTracker();
    const policy: BudgetPolicy = {
      name: "tight",
      scope: { type: "global" },
      window: "day",
      limits: { maxTotalTokens: 100 },
      enforcement: "hard",
    };
    tracker.record(policy, "global", { inputTokens: 80, outputTokens: 10, costUsd: 0 });
    const result = tracker.check(policy, "global", { inputTokens: 20, outputTokens: 5, costUsd: 0 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("total tokens");
  });

  it("allows but warns under soft enforcement", () => {
    const tracker = new BudgetTracker();
    const policy: BudgetPolicy = {
      name: "soft",
      scope: { type: "global" },
      window: "day",
      limits: { maxTotalTokens: 100 },
      enforcement: "soft",
    };
    tracker.record(policy, "global", { inputTokens: 90, outputTokens: 5, costUsd: 0 });
    const result = tracker.check(policy, "global", { inputTokens: 10, outputTokens: 5, costUsd: 0 });
    expect(result.allowed).toBe(true);
    expect(result.warn).toBe(true);
  });

  it("blocks per-request when input exceeds limit", () => {
    const tracker = new BudgetTracker();
    const policy: BudgetPolicy = {
      name: "per-req",
      scope: { type: "global" },
      window: "request",
      limits: { maxInputTokens: 50 },
      enforcement: "hard",
    };
    const result = tracker.check(policy, "global", { inputTokens: 100, outputTokens: 0, costUsd: 0 });
    expect(result.allowed).toBe(false);
  });

  it("blocks when cost exceeds limit", () => {
    const tracker = new BudgetTracker();
    const policy: BudgetPolicy = {
      name: "cost",
      scope: { type: "global" },
      window: "day",
      limits: { maxCostUsd: 1.0 },
      enforcement: "hard",
    };
    tracker.record(policy, "global", { inputTokens: 0, outputTokens: 0, costUsd: 0.9 });
    const result = tracker.check(policy, "global", { inputTokens: 0, outputTokens: 0, costUsd: 0.2 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("cost");
  });

  it("warns when approaching threshold", () => {
    const tracker = new BudgetTracker();
    const policy: BudgetPolicy = {
      name: "warn",
      scope: { type: "global" },
      window: "day",
      limits: { maxTotalTokens: 1000, warnAt: 0.8 },
      enforcement: "hard",
    };
    tracker.record(policy, "global", { inputTokens: 400, outputTokens: 400, costUsd: 0 });
    const result = tracker.check(policy, "global", { inputTokens: 50, outputTokens: 50, costUsd: 0 });
    expect(result.allowed).toBe(true);
    expect(result.warn).toBe(true);
  });
});

// --- BudgetGuard ---

describe("BudgetGuard", () => {
  it("allows request when within budget", () => {
    const guard = new BudgetGuard([{
      name: "global",
      scope: { type: "global" },
      window: "day",
      limits: { maxTotalTokens: 10000 },
      enforcement: "hard",
    }]);
    const result = guard.check(baseRequest, { inputTokens: 100, outputTokens: 50, costUsd: 0 });
    expect(result.allowed).toBe(true);
  });

  it("enforce throws GatewayError on hard budget exceeded", () => {
    const guard = new BudgetGuard([{
      name: "tight",
      scope: { type: "global" },
      window: "request",
      limits: { maxInputTokens: 10 },
      enforcement: "hard",
    }]);

    expect(() =>
      guard.enforce(baseRequest, { inputTokens: 100, outputTokens: 0, costUsd: 0 }, "req-1"),
    ).toThrow(GatewayError);
  });

  it("matches user-scoped policy", () => {
    const guard = new BudgetGuard([{
      name: "premium-limit",
      scope: { type: "user", key: "premium" },
      window: "request",
      limits: { maxInputTokens: 5000 },
      enforcement: "hard",
    }]);

    const premiumReq = { ...baseRequest, userTier: "premium" };
    const freeReq = { ...baseRequest, userTier: "free" };

    const premResult = guard.check(premiumReq, { inputTokens: 10000, outputTokens: 0, costUsd: 0 });
    expect(premResult.allowed).toBe(false);

    const freeResult = guard.check(freeReq, { inputTokens: 10000, outputTokens: 0, costUsd: 0 });
    expect(freeResult.allowed).toBe(true);
  });

  it("records usage and accumulates", () => {
    const guard = new BudgetGuard([{
      name: "daily",
      scope: { type: "global" },
      window: "day",
      limits: { maxTotalTokens: 200 },
      enforcement: "hard",
    }]);

    guard.record(baseRequest, { inputTokens: 80, outputTokens: 70, costUsd: 0 });
    guard.record(baseRequest, { inputTokens: 30, outputTokens: 20, costUsd: 0 });

    const result = guard.check(baseRequest, { inputTokens: 5, outputTokens: 5, costUsd: 0 });
    expect(result.allowed).toBe(false);
  });
});
