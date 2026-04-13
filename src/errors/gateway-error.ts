import type { GatewayErrorKind, GatewayErrorPayload } from "../types/error.js";

export class GatewayError extends Error {
  readonly code: string;
  readonly kind: GatewayErrorKind;
  readonly retryable: boolean;
  readonly httpStatus: number;
  readonly provider?: string;
  readonly requestId?: string;
  readonly details?: Record<string, unknown>;

  constructor(payload: GatewayErrorPayload) {
    super(payload.message);
    this.name = "GatewayError";
    this.code = payload.code;
    this.kind = payload.kind;
    this.retryable = payload.retryable;
    this.httpStatus = payload.httpStatus ?? 500;
    this.provider = payload.provider;
    this.requestId = payload.requestId;
    this.details = payload.details;
  }

  toJSON(): GatewayErrorPayload {
    return {
      code: this.code,
      kind: this.kind,
      message: this.message,
      retryable: this.retryable,
      httpStatus: this.httpStatus,
      provider: this.provider,
      requestId: this.requestId,
      details: this.details,
    };
  }

  static providerTimeout(provider: string, requestId?: string): GatewayError {
    return new GatewayError({
      code: "PROVIDER_TIMEOUT",
      kind: "provider_timeout",
      message: `Provider "${provider}" timed out`,
      retryable: true,
      httpStatus: 504,
      provider,
      requestId,
    });
  }

  static providerRateLimit(provider: string, requestId?: string): GatewayError {
    return new GatewayError({
      code: "PROVIDER_RATE_LIMIT",
      kind: "provider_rate_limit",
      message: `Provider "${provider}" rate limited`,
      retryable: true,
      httpStatus: 429,
      provider,
      requestId,
    });
  }

  static routeNotFound(requestId?: string): GatewayError {
    return new GatewayError({
      code: "ROUTE_NOT_FOUND",
      kind: "route_not_found",
      message: "No matching route found for request",
      retryable: false,
      httpStatus: 404,
      requestId,
    });
  }

  static budgetExceeded(
    policyName: string,
    requestId?: string,
  ): GatewayError {
    return new GatewayError({
      code: "BUDGET_EXCEEDED",
      kind: "budget_exceeded",
      message: `Budget policy "${policyName}" exceeded`,
      retryable: false,
      httpStatus: 429,
      requestId,
      details: { policy: policyName },
    });
  }

  static configInvalid(detail: string): GatewayError {
    return new GatewayError({
      code: "CONFIG_INVALID",
      kind: "config_invalid",
      message: `Invalid configuration: ${detail}`,
      retryable: false,
      httpStatus: 500,
    });
  }

  static providerAuth(provider: string, requestId?: string): GatewayError {
    return new GatewayError({
      code: "PROVIDER_AUTH",
      kind: "provider_auth",
      message: `Provider "${provider}" authentication failed`,
      retryable: false,
      httpStatus: 401,
      provider,
      requestId,
    });
  }

  static providerResponse(
    provider: string,
    upstreamStatus: number,
    detail: string,
    requestId?: string,
  ): GatewayError {
    return new GatewayError({
      code: "PROVIDER_RESPONSE",
      kind: "provider_response",
      message: `Provider "${provider}" returned ${upstreamStatus}: ${detail}`,
      retryable: upstreamStatus >= 500,
      httpStatus: 502,
      provider,
      requestId,
      details: { upstreamStatus },
    });
  }

  static fromHttpStatus(
    provider: string,
    status: number,
    body: string,
    requestId?: string,
  ): GatewayError {
    if (status === 401 || status === 403) {
      return GatewayError.providerAuth(provider, requestId);
    }
    if (status === 429) {
      return GatewayError.providerRateLimit(provider, requestId);
    }
    if (status === 408 || status === 504) {
      return GatewayError.providerTimeout(provider, requestId);
    }
    return GatewayError.providerResponse(provider, status, body.slice(0, 300), requestId);
  }
}
