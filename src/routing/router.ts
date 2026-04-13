import type { GatewayRequest } from "../types/gateway.js";
import type { RouteRule } from "../types/route.js";
import type { FallbackChain } from "../types/fallback.js";
import type { Provider, ProviderRequestOptions, ProviderResult, StreamResult } from "../providers/base.js";
import { ProviderRegistry } from "../providers/registry.js";
import { findMatchingRoute } from "./matcher.js";
import { executeWithFallback, executeStreamWithFallback, type FallbackResult, type FallbackStreamResult } from "./fallback.js";

export interface RouteDecision {
  rule: RouteRule;
  provider: Provider;
  model: string;
  fallbackChain?: FallbackChain;
}

export interface RouterResult {
  decision: RouteDecision;
  providerResult: ProviderResult;
  actualProvider: Provider;
  fallbackTriggered: boolean;
  fallbackFrom?: string;
}

export class Router {
  constructor(
    private readonly rules: RouteRule[],
    private readonly fallbackChains: FallbackChain[],
    private readonly registry: ProviderRegistry,
  ) {}

  resolve(request: GatewayRequest): RouteDecision {
    const rule = findMatchingRoute(this.rules, request);
    if (!rule) {
      throw new Error(
        `No route matches request: taskType=${request.taskType}, feature=${request.feature}, userTier=${request.userTier}`,
      );
    }

    const provider = this.registry.require(rule.target.provider);
    const model =
      request.model ?? rule.target.model ?? provider.name;

    const fallbackChain = rule.target.fallbackChain
      ? this.fallbackChains.find((c) => c.name === rule.target.fallbackChain)
      : undefined;

    return { rule, provider, model, fallbackChain };
  }

  async execute(
    request: GatewayRequest,
    decision: RouteDecision,
  ): Promise<RouterResult> {
    const reqOpts: ProviderRequestOptions = {
      model: decision.model,
      messages: request.messages,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
    };

    if (decision.fallbackChain) {
      const fb: FallbackResult = await executeWithFallback(
        decision.fallbackChain,
        this.registry,
        reqOpts,
      );
      return {
        decision,
        providerResult: fb.result,
        actualProvider: fb.provider,
        fallbackTriggered: fb.fallbackTriggered,
        fallbackFrom: fb.fallbackFrom,
      };
    }

    const result = await decision.provider.chat(reqOpts);
    return {
      decision,
      providerResult: result,
      actualProvider: decision.provider,
      fallbackTriggered: false,
    };
  }

  async executeStream(
    request: GatewayRequest,
    decision: RouteDecision,
  ): Promise<RouterStreamResult> {
    const reqOpts: ProviderRequestOptions = {
      model: decision.model,
      messages: request.messages,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      stream: true,
    };

    if (decision.fallbackChain) {
      const fb: FallbackStreamResult = await executeStreamWithFallback(
        decision.fallbackChain,
        this.registry,
        reqOpts,
      );
      return {
        decision,
        streamResult: fb.streamResult,
        actualProvider: fb.provider,
        fallbackTriggered: fb.fallbackTriggered,
        fallbackFrom: fb.fallbackFrom,
      };
    }

    const provider = decision.provider;
    if (!provider.chatStream) {
      throw new Error(`Provider "${provider.name}" does not support streaming`);
    }

    const streamResult = await provider.chatStream(reqOpts);
    return {
      decision,
      streamResult,
      actualProvider: provider,
      fallbackTriggered: false,
    };
  }
}

export interface RouterStreamResult {
  decision: RouteDecision;
  streamResult: StreamResult;
  actualProvider: Provider;
  fallbackTriggered: boolean;
  fallbackFrom?: string;
}
