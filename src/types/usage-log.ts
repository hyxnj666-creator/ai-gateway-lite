export interface UsageLog {
  timestamp: string;
  requestId: string;
  provider: string;
  model: string;
  routeRule?: string;
  feature?: string;
  userTier?: string;
  success: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  totalTokens: number;
  estimatedCostUsd?: number;
  latencyMs: number;
  fallbackTriggered?: boolean;
  fallbackFrom?: string;
  errorCode?: string;
}
