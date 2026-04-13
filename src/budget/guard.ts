import type { BudgetPolicy } from "../types/budget.js";
import type { GatewayRequest } from "../types/gateway.js";
import { BudgetTracker } from "./tracker.js";
import { GatewayError } from "../errors/gateway-error.js";

export interface BudgetCheckResult {
  allowed: boolean;
  warnings: string[];
  blockedBy?: string;
}

export class BudgetGuard {
  private readonly tracker = new BudgetTracker();

  constructor(private readonly policies: BudgetPolicy[]) {}

  check(
    request: GatewayRequest,
    estimated: { inputTokens: number; outputTokens: number; costUsd: number },
  ): BudgetCheckResult {
    const warnings: string[] = [];
    const matchingPolicies = this.findMatchingPolicies(request);

    for (const policy of matchingPolicies) {
      const scopeKey = this.resolveScopeKey(policy, request);
      const result = this.tracker.check(policy, scopeKey, estimated);

      if (result.warn && result.reason) {
        warnings.push(`[${policy.name}] ${result.reason}`);
      }

      if (!result.allowed) {
        return { allowed: false, warnings, blockedBy: policy.name };
      }
    }

    return { allowed: true, warnings };
  }

  record(
    request: GatewayRequest,
    usage: { inputTokens: number; outputTokens: number; costUsd: number },
  ): void {
    const matchingPolicies = this.findMatchingPolicies(request);

    for (const policy of matchingPolicies) {
      const scopeKey = this.resolveScopeKey(policy, request);
      this.tracker.record(policy, scopeKey, usage);
    }
  }

  enforce(
    request: GatewayRequest,
    estimated: { inputTokens: number; outputTokens: number; costUsd: number },
    requestId?: string,
  ): void {
    const result = this.check(request, estimated);

    for (const w of result.warnings) {
      console.warn(`[budget-warn] ${w}`);
    }

    if (!result.allowed && result.blockedBy) {
      throw GatewayError.budgetExceeded(result.blockedBy, requestId);
    }
  }

  private findMatchingPolicies(request: GatewayRequest): BudgetPolicy[] {
    return this.policies.filter((p) => {
      switch (p.scope.type) {
        case "global":
          return true;
        case "user":
          return !p.scope.key || p.scope.key === request.userTier;
        case "feature":
          return !p.scope.key || p.scope.key === request.feature;
        case "model":
          return !p.scope.key || p.scope.key === request.model;
        default:
          return false;
      }
    });
  }

  private resolveScopeKey(policy: BudgetPolicy, request: GatewayRequest): string {
    switch (policy.scope.type) {
      case "global":
        return "global";
      case "user":
        return request.userTier ?? "default";
      case "feature":
        return request.feature ?? "default";
      case "model":
        return request.model ?? "default";
      default:
        return "default";
    }
  }
}
