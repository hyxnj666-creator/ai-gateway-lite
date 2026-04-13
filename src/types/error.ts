export type GatewayErrorKind =
  | "provider_auth"
  | "provider_timeout"
  | "provider_rate_limit"
  | "provider_response"
  | "route_not_found"
  | "budget_exceeded"
  | "config_invalid"
  | "internal";

export interface GatewayErrorPayload {
  code: string;
  kind: GatewayErrorKind;
  message: string;
  retryable: boolean;
  httpStatus?: number;
  provider?: string;
  requestId?: string;
  details?: Record<string, unknown>;
}
