import { describe, it, expect } from "vitest";
import { GatewayError } from "../gateway-error.js";

describe("GatewayError", () => {
  it("constructs with all fields", () => {
    const err = new GatewayError({
      code: "TEST",
      kind: "internal",
      message: "test error",
      retryable: false,
      httpStatus: 500,
      provider: "openai",
      requestId: "req-1",
      details: { foo: "bar" },
    });

    expect(err.code).toBe("TEST");
    expect(err.kind).toBe("internal");
    expect(err.message).toBe("test error");
    expect(err.retryable).toBe(false);
    expect(err.httpStatus).toBe(500);
    expect(err.provider).toBe("openai");
    expect(err.requestId).toBe("req-1");
    expect(err.details).toEqual({ foo: "bar" });
    expect(err.name).toBe("GatewayError");
    expect(err instanceof Error).toBe(true);
  });

  it("defaults httpStatus to 500", () => {
    const err = new GatewayError({
      code: "X",
      kind: "internal",
      message: "x",
      retryable: false,
    });
    expect(err.httpStatus).toBe(500);
  });

  it("toJSON returns serializable payload", () => {
    const err = GatewayError.providerTimeout("openai", "req-1");
    const json = err.toJSON();
    expect(json.code).toBe("PROVIDER_TIMEOUT");
    expect(json.kind).toBe("provider_timeout");
    expect(json.retryable).toBe(true);
    expect(json.httpStatus).toBe(504);
    expect(json.provider).toBe("openai");
    expect(json.requestId).toBe("req-1");
  });

  it("providerRateLimit factory", () => {
    const err = GatewayError.providerRateLimit("anthropic");
    expect(err.code).toBe("PROVIDER_RATE_LIMIT");
    expect(err.kind).toBe("provider_rate_limit");
    expect(err.httpStatus).toBe(429);
    expect(err.retryable).toBe(true);
  });

  it("routeNotFound factory", () => {
    const err = GatewayError.routeNotFound("req-2");
    expect(err.code).toBe("ROUTE_NOT_FOUND");
    expect(err.kind).toBe("route_not_found");
    expect(err.httpStatus).toBe(404);
    expect(err.retryable).toBe(false);
  });

  it("budgetExceeded factory", () => {
    const err = GatewayError.budgetExceeded("daily-limit", "req-3");
    expect(err.code).toBe("BUDGET_EXCEEDED");
    expect(err.kind).toBe("budget_exceeded");
    expect(err.httpStatus).toBe(429);
    expect(err.details).toEqual({ policy: "daily-limit" });
  });

  it("configInvalid factory", () => {
    const err = GatewayError.configInvalid("missing providers");
    expect(err.code).toBe("CONFIG_INVALID");
    expect(err.kind).toBe("config_invalid");
    expect(err.message).toContain("missing providers");
  });
});
