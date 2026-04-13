import { describe, it, expect } from "vitest";
import { findMatchingRoute } from "../matcher.js";
import type { RouteRule } from "../../types/route.js";
import type { GatewayRequest } from "../../types/gateway.js";

const baseRequest: GatewayRequest = {
  messages: [{ role: "user", content: "hi" }],
};

function rule(overrides: Partial<RouteRule> & { name: string; priority: number }): RouteRule {
  return {
    match: {},
    target: { provider: "test" },
    ...overrides,
  };
}

describe("findMatchingRoute", () => {
  it("returns undefined when no rules", () => {
    expect(findMatchingRoute([], baseRequest)).toBeUndefined();
  });

  it("matches a catch-all rule", () => {
    const rules = [rule({ name: "catch-all", priority: 0 })];
    expect(findMatchingRoute(rules, baseRequest)?.name).toBe("catch-all");
  });

  it("matches by taskType", () => {
    const rules = [
      rule({ name: "specific", priority: 100, match: { taskType: "complex" } }),
      rule({ name: "catch-all", priority: 0 }),
    ];
    const req = { ...baseRequest, taskType: "complex" };
    expect(findMatchingRoute(rules, req)?.name).toBe("specific");
  });

  it("does not match when taskType differs", () => {
    const rules = [
      rule({ name: "specific", priority: 100, match: { taskType: "complex" } }),
    ];
    const req = { ...baseRequest, taskType: "simple" };
    expect(findMatchingRoute(rules, req)).toBeUndefined();
  });

  it("matches by userTier", () => {
    const rules = [
      rule({ name: "premium", priority: 50, match: { userTier: "premium" } }),
      rule({ name: "catch-all", priority: 0 }),
    ];
    const req = { ...baseRequest, userTier: "premium" };
    expect(findMatchingRoute(rules, req)?.name).toBe("premium");
  });

  it("matches by feature", () => {
    const rules = [
      rule({ name: "code", priority: 50, match: { feature: "code-gen" } }),
      rule({ name: "catch-all", priority: 0 }),
    ];
    const req = { ...baseRequest, feature: "code-gen" };
    expect(findMatchingRoute(rules, req)?.name).toBe("code");
  });

  it("higher priority wins when multiple rules match", () => {
    const rules = [
      rule({ name: "low", priority: 10 }),
      rule({ name: "high", priority: 100 }),
      rule({ name: "mid", priority: 50 }),
    ];
    expect(findMatchingRoute(rules, baseRequest)?.name).toBe("high");
  });

  it("skips disabled rules", () => {
    const rules = [
      rule({ name: "disabled", priority: 100, enabled: false }),
      rule({ name: "active", priority: 10 }),
    ];
    expect(findMatchingRoute(rules, baseRequest)?.name).toBe("active");
  });

  it("matches multi-field rules", () => {
    const rules = [
      rule({
        name: "premium-complex",
        priority: 100,
        match: { taskType: "complex", userTier: "premium" },
      }),
      rule({ name: "catch-all", priority: 0 }),
    ];
    const req = { ...baseRequest, taskType: "complex", userTier: "premium" };
    expect(findMatchingRoute(rules, req)?.name).toBe("premium-complex");
  });

  it("rejects partial multi-field match", () => {
    const rules = [
      rule({
        name: "premium-complex",
        priority: 100,
        match: { taskType: "complex", userTier: "premium" },
      }),
    ];
    const req = { ...baseRequest, taskType: "complex", userTier: "free" };
    expect(findMatchingRoute(rules, req)).toBeUndefined();
  });
});
