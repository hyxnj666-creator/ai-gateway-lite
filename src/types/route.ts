export interface RouteMatch {
  taskType?: string;
  userTier?: string;
  sensitivity?: "low" | "medium" | "high";
  feature?: string;
}

export interface RouteTarget {
  provider: string;
  model?: string;
  fallbackChain?: string;
}

export interface RouteConstraints {
  maxCostUsd?: number;
  maxInputTokens?: number;
  maxLatencyMs?: number;
}

export interface RouteRule {
  name: string;
  priority: number;
  enabled?: boolean;
  match: RouteMatch;
  target: RouteTarget;
  constraints?: RouteConstraints;
}
