import { describe, it, expect } from "vitest";
import { estimateCostUsd, getModelPricing, registerModelPricing } from "../pricing-table.js";

describe("getModelPricing", () => {
  it("returns pricing for known model", () => {
    const p = getModelPricing("gpt-4o");
    expect(p).toBeDefined();
    expect(p!.inputPer1kTokens).toBeGreaterThan(0);
    expect(p!.outputPer1kTokens).toBeGreaterThan(0);
  });

  it("returns undefined for unknown model", () => {
    expect(getModelPricing("unknown-model-xyz")).toBeUndefined();
  });

  it("resolves alias", () => {
    const p = getModelPricing("claude-3-opus");
    expect(p).toBeDefined();
  });
});

describe("estimateCostUsd", () => {
  it("calculates cost for known model", () => {
    const cost = estimateCostUsd("gpt-4o", 1000, 500);
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeCloseTo(0.0025 + 0.005, 6);
  });

  it("returns 0 for unknown model", () => {
    expect(estimateCostUsd("unknown-model", 1000, 500)).toBe(0);
  });

  it("returns 0 for zero tokens", () => {
    expect(estimateCostUsd("gpt-4o", 0, 0)).toBe(0);
  });
});

describe("registerModelPricing", () => {
  it("registers custom pricing", () => {
    registerModelPricing("custom-model", { inputPer1kTokens: 0.001, outputPer1kTokens: 0.002 });
    const p = getModelPricing("custom-model");
    expect(p).toBeDefined();
    expect(p!.inputPer1kTokens).toBe(0.001);
    expect(estimateCostUsd("custom-model", 1000, 1000)).toBeCloseTo(0.003, 6);
  });
});
