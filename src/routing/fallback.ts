import type { FallbackChain, FallbackTrigger } from "../types/fallback.js";
import type { Provider, ProviderRequestOptions, ProviderResult, StreamResult } from "../providers/base.js";
import { ProviderRegistry } from "../providers/registry.js";
import { GatewayError } from "../errors/gateway-error.js";

function classifyError(err: unknown): FallbackTrigger {
  if (err instanceof GatewayError) {
    switch (err.kind) {
      case "provider_timeout":
        return "timeout";
      case "provider_rate_limit":
        return "rate_limit";
      case "budget_exceeded":
        return "budget_exceeded";
      default:
        return "provider_error";
    }
  }

  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("timeout") || msg.includes("aborted")) return "timeout";
  if (msg.includes("429") || msg.includes("rate")) return "rate_limit";
  return "provider_error";
}

export interface FallbackResult {
  result: ProviderResult;
  provider: Provider;
  fallbackTriggered: boolean;
  fallbackFrom?: string;
}

export async function executeWithFallback(
  chain: FallbackChain,
  registry: ProviderRegistry,
  requestOptions: ProviderRequestOptions,
): Promise<FallbackResult> {
  let lastError: unknown;
  let firstProvider: string | undefined;

  for (let i = 0; i < chain.steps.length; i++) {
    const step = chain.steps[i]!;
    const provider = registry.require(step.provider);

    if (i === 0) firstProvider = provider.name;

    const opts: ProviderRequestOptions = {
      ...requestOptions,
      ...(step.model && { model: step.model }),
    };

    try {
      const result = await provider.chat(opts);
      return {
        result,
        provider,
        fallbackTriggered: i > 0,
        fallbackFrom: i > 0 ? firstProvider : undefined,
      };
    } catch (err) {
      lastError = err;
      const trigger = classifyError(err);

      const nextStep = chain.steps[i + 1];
      if (!nextStep) break;

      if (nextStep.when && nextStep.when.length > 0) {
        if (!nextStep.when.includes(trigger)) break;
      }
    }
  }

  throw lastError ?? new Error("Fallback chain exhausted with no result");
}

export interface FallbackStreamResult {
  streamResult: StreamResult;
  provider: Provider;
  fallbackTriggered: boolean;
  fallbackFrom?: string;
}

export async function executeStreamWithFallback(
  chain: FallbackChain,
  registry: ProviderRegistry,
  requestOptions: ProviderRequestOptions,
): Promise<FallbackStreamResult> {
  let lastError: unknown;
  let firstProvider: string | undefined;

  for (let i = 0; i < chain.steps.length; i++) {
    const step = chain.steps[i]!;
    const provider = registry.require(step.provider);

    if (i === 0) firstProvider = provider.name;

    if (!provider.chatStream) {
      lastError = new Error(`Provider "${provider.name}" does not support streaming`);
      const nextStep = chain.steps[i + 1];
      if (!nextStep) break;
      if (nextStep.when && nextStep.when.length > 0) {
        if (!nextStep.when.includes("provider_error")) break;
      }
      continue;
    }

    const opts: ProviderRequestOptions = {
      ...requestOptions,
      stream: true,
      ...(step.model && { model: step.model }),
    };

    try {
      const streamResult = await provider.chatStream(opts);
      return {
        streamResult,
        provider,
        fallbackTriggered: i > 0,
        fallbackFrom: i > 0 ? firstProvider : undefined,
      };
    } catch (err) {
      lastError = err;
      const trigger = classifyError(err);

      const nextStep = chain.steps[i + 1];
      if (!nextStep) break;

      if (nextStep.when && nextStep.when.length > 0) {
        if (!nextStep.when.includes(trigger)) break;
      }
    }
  }

  throw lastError ?? new Error("Fallback chain exhausted with no result");
}
