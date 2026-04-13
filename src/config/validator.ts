import { GatewayError } from "../errors/gateway-error.js";
import type { ProviderConfig } from "../types/provider.js";
import type { RouteRule } from "../types/route.js";
import type { FallbackChain } from "../types/fallback.js";
import type { BudgetPolicy } from "../types/budget.js";

export interface ValidationError {
  path: string;
  message: string;
}

function err(path: string, message: string): ValidationError {
  return { path, message };
}

const VALID_AUTH_TYPES = new Set(["apiKey", "bearer", "none", "customHeader"]);
const VALID_BUDGET_WINDOWS = new Set(["request", "hour", "day", "month"]);
const VALID_BUDGET_SCOPES = new Set(["global", "user", "feature", "model"]);
const VALID_ENFORCEMENT = new Set(["soft", "hard"]);
const VALID_TRIGGERS = new Set(["timeout", "rate_limit", "provider_error", "budget_exceeded", "manual"]);

export function validateProviders(providers: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!Array.isArray(providers)) {
    return [err("providers", "must be an array")];
  }

  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    const prefix = `providers[${i}]`;

    if (!p || typeof p !== "object") {
      errors.push(err(prefix, "must be an object"));
      continue;
    }

    const cfg = p as Record<string, unknown>;

    if (typeof cfg.name !== "string" || !cfg.name) {
      errors.push(err(`${prefix}.name`, "required string"));
    }
    if (typeof cfg.provider !== "string" || !cfg.provider) {
      errors.push(err(`${prefix}.provider`, "required string (e.g. 'openai', 'anthropic', 'openrouter')"));
    }
    if (!Array.isArray(cfg.models) || cfg.models.length === 0) {
      errors.push(err(`${prefix}.models`, "must be a non-empty array of strings"));
    }
    if (!cfg.auth || typeof cfg.auth !== "object") {
      errors.push(err(`${prefix}.auth`, "required object with 'type' field"));
    } else {
      const auth = cfg.auth as Record<string, unknown>;
      if (!VALID_AUTH_TYPES.has(auth.type as string)) {
        errors.push(err(`${prefix}.auth.type`, `must be one of: ${[...VALID_AUTH_TYPES].join(", ")}`));
      }
      if (auth.type !== "none" && typeof auth.envVar !== "string") {
        errors.push(err(`${prefix}.auth.envVar`, `required when auth.type is "${auth.type}"`));
      }
    }
  }

  return errors;
}

export function validateRoutes(rules: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!Array.isArray(rules)) {
    return [err("rules", "must be an array")];
  }

  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    const prefix = `rules[${i}]`;

    if (!r || typeof r !== "object") {
      errors.push(err(prefix, "must be an object"));
      continue;
    }

    const rule = r as Record<string, unknown>;

    if (typeof rule.name !== "string" || !rule.name) {
      errors.push(err(`${prefix}.name`, "required string"));
    }
    if (typeof rule.priority !== "number") {
      errors.push(err(`${prefix}.priority`, "required number"));
    }
    if (!rule.target || typeof rule.target !== "object") {
      errors.push(err(`${prefix}.target`, "required object with 'provider' field"));
    } else {
      const target = rule.target as Record<string, unknown>;
      if (typeof target.provider !== "string" || !target.provider) {
        errors.push(err(`${prefix}.target.provider`, "required string"));
      }
    }
  }

  return errors;
}

export function validateFallbackChains(chains: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (chains === undefined || chains === null) return [];
  if (!Array.isArray(chains)) {
    return [err("fallbackChains", "must be an array")];
  }

  for (let i = 0; i < chains.length; i++) {
    const c = chains[i];
    const prefix = `fallbackChains[${i}]`;

    if (!c || typeof c !== "object") {
      errors.push(err(prefix, "must be an object"));
      continue;
    }

    const chain = c as Record<string, unknown>;

    if (typeof chain.name !== "string" || !chain.name) {
      errors.push(err(`${prefix}.name`, "required string"));
    }
    if (!Array.isArray(chain.steps) || chain.steps.length === 0) {
      errors.push(err(`${prefix}.steps`, "must be a non-empty array"));
    } else {
      for (let j = 0; j < (chain.steps as unknown[]).length; j++) {
        const step = (chain.steps as Record<string, unknown>[])[j]!;
        const sp = `${prefix}.steps[${j}]`;
        if (typeof step.provider !== "string" || !step.provider) {
          errors.push(err(`${sp}.provider`, "required string"));
        }
        if (step.when !== undefined) {
          if (!Array.isArray(step.when)) {
            errors.push(err(`${sp}.when`, "must be an array of trigger strings"));
          } else {
            for (const trigger of step.when as string[]) {
              if (!VALID_TRIGGERS.has(trigger)) {
                errors.push(err(`${sp}.when`, `invalid trigger "${trigger}", must be: ${[...VALID_TRIGGERS].join(", ")}`));
              }
            }
          }
        }
      }
    }
  }

  return errors;
}

export function validateBudgets(budgets: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!Array.isArray(budgets)) {
    return [err("budgets", "must be an array")];
  }

  for (let i = 0; i < budgets.length; i++) {
    const b = budgets[i];
    const prefix = `budgets[${i}]`;

    if (!b || typeof b !== "object") {
      errors.push(err(prefix, "must be an object"));
      continue;
    }

    const policy = b as Record<string, unknown>;

    if (typeof policy.name !== "string" || !policy.name) {
      errors.push(err(`${prefix}.name`, "required string"));
    }
    if (!VALID_BUDGET_WINDOWS.has(policy.window as string)) {
      errors.push(err(`${prefix}.window`, `must be one of: ${[...VALID_BUDGET_WINDOWS].join(", ")}`));
    }
    if (!VALID_ENFORCEMENT.has(policy.enforcement as string)) {
      errors.push(err(`${prefix}.enforcement`, `must be one of: ${[...VALID_ENFORCEMENT].join(", ")}`));
    }
    if (!policy.scope || typeof policy.scope !== "object") {
      errors.push(err(`${prefix}.scope`, "required object with 'type' field"));
    } else {
      const scope = policy.scope as Record<string, unknown>;
      if (!VALID_BUDGET_SCOPES.has(scope.type as string)) {
        errors.push(err(`${prefix}.scope.type`, `must be one of: ${[...VALID_BUDGET_SCOPES].join(", ")}`));
      }
    }
  }

  return errors;
}

export function validateConfig(raw: {
  providers: unknown;
  routes: { rules: unknown; fallbackChains?: unknown };
  budgets: unknown;
}): void {
  const errors: ValidationError[] = [
    ...validateProviders(raw.providers),
    ...validateRoutes(raw.routes.rules),
    ...validateFallbackChains(raw.routes.fallbackChains),
    ...validateBudgets(raw.budgets),
  ];

  if (errors.length > 0) {
    const lines = errors.map((e) => `  - ${e.path}: ${e.message}`);
    throw GatewayError.configInvalid(
      `${errors.length} validation error(s):\n${lines.join("\n")}`,
    );
  }
}
