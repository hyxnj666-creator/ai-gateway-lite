import { describe, it, expect } from "vitest";
import { GatewayError } from "../gateway-error.js";

describe("GatewayError.fromHttpStatus", () => {
  it("classifies 401 as provider_auth", () => {
    const err = GatewayError.fromHttpStatus("p1", 401, "Unauthorized");
    expect(err.kind).toBe("provider_auth");
    expect(err.httpStatus).toBe(401);
    expect(err.retryable).toBe(false);
  });

  it("classifies 403 as provider_auth", () => {
    const err = GatewayError.fromHttpStatus("p1", 403, "Forbidden");
    expect(err.kind).toBe("provider_auth");
  });

  it("classifies 429 as provider_rate_limit", () => {
    const err = GatewayError.fromHttpStatus("p1", 429, "Too Many Requests");
    expect(err.kind).toBe("provider_rate_limit");
    expect(err.retryable).toBe(true);
  });

  it("classifies 408 as provider_timeout", () => {
    const err = GatewayError.fromHttpStatus("p1", 408, "Request Timeout");
    expect(err.kind).toBe("provider_timeout");
    expect(err.retryable).toBe(true);
  });

  it("classifies 504 as provider_timeout", () => {
    const err = GatewayError.fromHttpStatus("p1", 504, "Gateway Timeout");
    expect(err.kind).toBe("provider_timeout");
  });

  it("classifies 500 as provider_response (retryable)", () => {
    const err = GatewayError.fromHttpStatus("p1", 500, "Internal Server Error");
    expect(err.kind).toBe("provider_response");
    expect(err.retryable).toBe(true);
    expect(err.httpStatus).toBe(502);
  });

  it("classifies 400 as provider_response (not retryable)", () => {
    const err = GatewayError.fromHttpStatus("p1", 400, "Bad Request");
    expect(err.kind).toBe("provider_response");
    expect(err.retryable).toBe(false);
  });

  it("providerAuth factory", () => {
    const err = GatewayError.providerAuth("anthropic", "req-1");
    expect(err.code).toBe("PROVIDER_AUTH");
    expect(err.provider).toBe("anthropic");
    expect(err.httpStatus).toBe(401);
  });

  it("providerResponse factory", () => {
    const err = GatewayError.providerResponse("openai", 503, "Service Unavailable");
    expect(err.code).toBe("PROVIDER_RESPONSE");
    expect(err.kind).toBe("provider_response");
    expect(err.retryable).toBe(true);
    expect(err.details?.upstreamStatus).toBe(503);
  });
});
