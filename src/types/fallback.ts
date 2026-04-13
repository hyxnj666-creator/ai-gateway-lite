export type FallbackTrigger =
  | "timeout"
  | "rate_limit"
  | "provider_error"
  | "budget_exceeded"
  | "manual";

export interface FallbackStep {
  provider: string;
  model?: string;
  when?: FallbackTrigger[];
  timeoutMs?: number;
}

export interface FallbackChain {
  name: string;
  steps: FallbackStep[];
}
