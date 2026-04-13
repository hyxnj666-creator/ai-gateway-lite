import { describe, it, expect } from "vitest";
import {
  validateProviders,
  validateRoutes,
  validateFallbackChains,
  validateBudgets,
  validateConfig,
} from "../validator.js";
import { GatewayError } from "../../errors/gateway-error.js";

describe("validateProviders", () => {
  it("passes valid providers", () => {
    const errors = validateProviders([
      { name: "openai", provider: "openai", models: ["gpt-4o"], auth: { type: "apiKey", envVar: "OPENAI_API_KEY" } },
    ]);
    expect(errors).toHaveLength(0);
  });

  it("rejects non-array", () => {
    expect(validateProviders("nope")).toHaveLength(1);
    expect(validateProviders("nope")[0]!.path).toBe("providers");
  });

  it("reports missing name", () => {
    const errors = validateProviders([{ provider: "openai", models: ["m"], auth: { type: "none" } }]);
    expect(errors.some((e) => e.path.includes("name"))).toBe(true);
  });

  it("reports missing models", () => {
    const errors = validateProviders([{ name: "x", provider: "openai", models: [], auth: { type: "none" } }]);
    expect(errors.some((e) => e.path.includes("models"))).toBe(true);
  });

  it("reports invalid auth type", () => {
    const errors = validateProviders([{ name: "x", provider: "openai", models: ["m"], auth: { type: "magic" } }]);
    expect(errors.some((e) => e.path.includes("auth.type"))).toBe(true);
  });

  it("requires envVar for non-none auth", () => {
    const errors = validateProviders([{ name: "x", provider: "openai", models: ["m"], auth: { type: "apiKey" } }]);
    expect(errors.some((e) => e.path.includes("envVar"))).toBe(true);
  });
});

describe("validateRoutes", () => {
  it("passes valid rules", () => {
    const errors = validateRoutes([{ name: "default", priority: 0, match: {}, target: { provider: "x" } }]);
    expect(errors).toHaveLength(0);
  });

  it("reports missing target.provider", () => {
    const errors = validateRoutes([{ name: "x", priority: 0, target: {} }]);
    expect(errors.some((e) => e.path.includes("target.provider"))).toBe(true);
  });

  it("reports missing priority", () => {
    const errors = validateRoutes([{ name: "x", target: { provider: "p" } }]);
    expect(errors.some((e) => e.path.includes("priority"))).toBe(true);
  });
});

describe("validateFallbackChains", () => {
  it("accepts undefined", () => {
    expect(validateFallbackChains(undefined)).toHaveLength(0);
  });

  it("passes valid chain", () => {
    const errors = validateFallbackChains([{ name: "c", steps: [{ provider: "p" }] }]);
    expect(errors).toHaveLength(0);
  });

  it("reports empty steps", () => {
    const errors = validateFallbackChains([{ name: "c", steps: [] }]);
    expect(errors.some((e) => e.path.includes("steps"))).toBe(true);
  });

  it("reports invalid trigger", () => {
    const errors = validateFallbackChains([{ name: "c", steps: [{ provider: "p", when: ["invalid_trigger"] }] }]);
    expect(errors.some((e) => e.message.includes("invalid_trigger"))).toBe(true);
  });
});

describe("validateBudgets", () => {
  it("passes valid budget", () => {
    const errors = validateBudgets([{
      name: "b", scope: { type: "global" }, window: "day", enforcement: "hard",
    }]);
    expect(errors).toHaveLength(0);
  });

  it("reports invalid window", () => {
    const errors = validateBudgets([{
      name: "b", scope: { type: "global" }, window: "century", enforcement: "hard",
    }]);
    expect(errors.some((e) => e.path.includes("window"))).toBe(true);
  });

  it("reports invalid scope type", () => {
    const errors = validateBudgets([{
      name: "b", scope: { type: "team" }, window: "day", enforcement: "hard",
    }]);
    expect(errors.some((e) => e.path.includes("scope.type"))).toBe(true);
  });
});

describe("validateConfig", () => {
  it("throws GatewayError.configInvalid on errors", () => {
    expect(() =>
      validateConfig({
        providers: "bad",
        routes: { rules: "bad" },
        budgets: "bad",
      }),
    ).toThrow(GatewayError);
  });

  it("passes valid config without throwing", () => {
    expect(() =>
      validateConfig({
        providers: [{ name: "x", provider: "openai", models: ["m"], auth: { type: "none" } }],
        routes: { rules: [{ name: "r", priority: 0, target: { provider: "x" } }] },
        budgets: [{ name: "b", scope: { type: "global" }, window: "day", enforcement: "hard" }],
      }),
    ).not.toThrow();
  });
});
