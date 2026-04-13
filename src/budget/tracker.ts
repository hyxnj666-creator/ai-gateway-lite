import type { BudgetPolicy } from "../types/budget.js";

interface BucketKey {
  policy: string;
  scopeKey: string;
  window: string;
}

interface Bucket {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  windowStart: number;
}

function bucketId(key: BucketKey): string {
  return `${key.policy}::${key.scopeKey}::${key.window}`;
}

function windowDurationMs(window: string): number {
  switch (window) {
    case "request":
      return 0;
    case "hour":
      return 3_600_000;
    case "day":
      return 86_400_000;
    case "month":
      return 30 * 86_400_000;
    default:
      return 86_400_000;
  }
}

export class BudgetTracker {
  private readonly buckets = new Map<string, Bucket>();

  private getBucket(key: BucketKey): Bucket {
    const id = bucketId(key);
    const now = Date.now();
    const existing = this.buckets.get(id);
    const duration = windowDurationMs(key.window);

    if (existing && (duration === 0 || now - existing.windowStart < duration)) {
      return existing;
    }

    const fresh: Bucket = {
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      windowStart: now,
    };
    this.buckets.set(id, fresh);
    return fresh;
  }

  check(
    policy: BudgetPolicy,
    scopeKey: string,
    pending: { inputTokens: number; outputTokens: number; costUsd: number },
  ): { allowed: boolean; warn: boolean; reason?: string } {
    if (policy.window === "request") {
      return this.checkSingle(policy, pending);
    }

    const bucket = this.getBucket({
      policy: policy.name,
      scopeKey,
      window: policy.window,
    });

    const limits = policy.limits;
    if (!limits) return { allowed: true, warn: false };

    const projectedTotal = bucket.totalTokens + pending.inputTokens + pending.outputTokens;
    const projectedCost = bucket.costUsd + pending.costUsd;

    let warn = false;
    if (limits.warnAt != null) {
      if (limits.maxTotalTokens && projectedTotal >= limits.maxTotalTokens * limits.warnAt)
        warn = true;
      if (limits.maxCostUsd && projectedCost >= limits.maxCostUsd * limits.warnAt)
        warn = true;
    }

    if (limits.maxTotalTokens && projectedTotal > limits.maxTotalTokens) {
      return {
        allowed: policy.enforcement === "soft",
        warn: true,
        reason: `total tokens ${projectedTotal} > limit ${limits.maxTotalTokens}`,
      };
    }

    if (limits.maxInputTokens && bucket.inputTokens + pending.inputTokens > limits.maxInputTokens) {
      return {
        allowed: policy.enforcement === "soft",
        warn: true,
        reason: `input tokens exceeded limit ${limits.maxInputTokens}`,
      };
    }

    if (limits.maxCostUsd && projectedCost > limits.maxCostUsd) {
      return {
        allowed: policy.enforcement === "soft",
        warn: true,
        reason: `cost $${projectedCost.toFixed(4)} > limit $${limits.maxCostUsd}`,
      };
    }

    return { allowed: true, warn };
  }

  record(
    policy: BudgetPolicy,
    scopeKey: string,
    usage: { inputTokens: number; outputTokens: number; costUsd: number },
  ): void {
    if (policy.window === "request") return;

    const bucket = this.getBucket({
      policy: policy.name,
      scopeKey,
      window: policy.window,
    });

    bucket.inputTokens += usage.inputTokens;
    bucket.outputTokens += usage.outputTokens;
    bucket.totalTokens += usage.inputTokens + usage.outputTokens;
    bucket.costUsd += usage.costUsd;
  }

  private checkSingle(
    policy: BudgetPolicy,
    pending: { inputTokens: number; outputTokens: number; costUsd: number },
  ): { allowed: boolean; warn: boolean; reason?: string } {
    const limits = policy.limits;
    if (!limits) return { allowed: true, warn: false };

    if (limits.maxInputTokens && pending.inputTokens > limits.maxInputTokens) {
      return {
        allowed: policy.enforcement === "soft",
        warn: true,
        reason: `request input tokens ${pending.inputTokens} > limit ${limits.maxInputTokens}`,
      };
    }

    if (limits.maxCostUsd && pending.costUsd > limits.maxCostUsd) {
      return {
        allowed: policy.enforcement === "soft",
        warn: true,
        reason: `request cost > limit $${limits.maxCostUsd}`,
      };
    }

    return { allowed: true, warn: false };
  }
}
