import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ProviderConfig } from "../types/provider.js";
import type { RouteRule } from "../types/route.js";
import type { FallbackChain } from "../types/fallback.js";
import type { BudgetPolicy } from "../types/budget.js";
import { GatewayError } from "../errors/gateway-error.js";
import { validateConfig } from "./validator.js";

export interface GatewayConfig {
  providers: ProviderConfig[];
  routes: RouteRule[];
  fallbackChains: FallbackChain[];
  budgets: BudgetPolicy[];
}

export interface ConfigPaths {
  providers?: string;
  routes?: string;
  budgets?: string;
}

const DEFAULT_PATHS: Required<ConfigPaths> = {
  providers: "gateway.providers.json",
  routes: "gateway.routes.json",
  budgets: "gateway.budgets.json",
};

async function loadJsonFile<T>(filePath: string): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw GatewayError.configInvalid(`Failed to read "${filePath}": ${msg}`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw GatewayError.configInvalid(`Failed to parse JSON in "${filePath}"`);
  }
}

interface RoutesFile {
  rules: RouteRule[];
  fallbackChains: FallbackChain[];
}

export async function loadConfig(
  baseDir: string,
  paths?: ConfigPaths,
): Promise<GatewayConfig> {
  const resolved = {
    providers: resolve(baseDir, paths?.providers ?? DEFAULT_PATHS.providers),
    routes: resolve(baseDir, paths?.routes ?? DEFAULT_PATHS.routes),
    budgets: resolve(baseDir, paths?.budgets ?? DEFAULT_PATHS.budgets),
  };

  const [providers, routesFile, budgets] = await Promise.all([
    loadJsonFile<ProviderConfig[]>(resolved.providers),
    loadJsonFile<RoutesFile>(resolved.routes),
    loadJsonFile<BudgetPolicy[]>(resolved.budgets),
  ]);

  validateConfig({
    providers,
    routes: routesFile,
    budgets,
  });

  return {
    providers,
    routes: routesFile.rules,
    fallbackChains: routesFile.fallbackChains ?? [],
    budgets,
  };
}

export function loadConfigFromObjects(raw: {
  providers: ProviderConfig[];
  routes: { rules: RouteRule[]; fallbackChains?: FallbackChain[] };
  budgets: BudgetPolicy[];
}): GatewayConfig {
  validateConfig({
    providers: raw.providers,
    routes: raw.routes,
    budgets: raw.budgets,
  });

  return {
    providers: raw.providers,
    routes: raw.routes.rules,
    fallbackChains: raw.routes.fallbackChains ?? [],
    budgets: raw.budgets,
  };
}
