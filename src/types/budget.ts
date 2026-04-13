export interface BudgetScope {
  type: "global" | "user" | "feature" | "model";
  key?: string;
}

export interface BudgetLimits {
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxTotalTokens?: number;
  maxCostUsd?: number;
  warnAt?: number;
}

export interface BudgetPolicy {
  name: string;
  scope: BudgetScope;
  window: "request" | "hour" | "day" | "month";
  limits?: BudgetLimits;
  enforcement: "soft" | "hard";
}
