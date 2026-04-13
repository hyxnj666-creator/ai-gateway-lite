import { randomUUID } from "node:crypto";
import type { GatewayRequest, GatewayResponse, GatewayStreamChunk, GatewayStreamResponse } from "./types/gateway.js";
import type { UsageLog } from "./types/usage-log.js";
import type { GatewayConfig } from "./config/loader.js";
import type { UsageLogHandler } from "./logging/usage-logger.js";
import type { ProviderFactory } from "./providers/registry.js";
import { ProviderRegistry } from "./providers/registry.js";
import { Router } from "./routing/router.js";
import { BudgetGuard } from "./budget/guard.js";
import { UsageLogger } from "./logging/usage-logger.js";
import { GatewayError } from "./errors/gateway-error.js";
import { estimateCostUsd } from "./pricing/pricing-table.js";

export interface GatewayOptions {
  config: GatewayConfig;
  onUsageLog?: UsageLogHandler;
  customProviders?: Record<string, ProviderFactory>;
}

export class Gateway {
  private readonly registry: ProviderRegistry;
  private readonly router: Router;
  private readonly budgetGuard: BudgetGuard;
  private readonly logger: UsageLogger;

  constructor(options: GatewayOptions) {
    this.registry = new ProviderRegistry();

    if (options.customProviders) {
      for (const [family, factory] of Object.entries(options.customProviders)) {
        this.registry.registerFactory(family, factory);
      }
    }

    this.registry.load(options.config.providers);

    this.router = new Router(
      options.config.routes,
      options.config.fallbackChains,
      this.registry,
    );

    this.budgetGuard = new BudgetGuard(options.config.budgets);
    this.logger = new UsageLogger(options.onUsageLog);
  }

  async chat(request: GatewayRequest): Promise<GatewayResponse> {
    const requestId = randomUUID();
    const start = performance.now();

    let decision;
    try {
      decision = this.router.resolve(request);
    } catch {
      throw GatewayError.routeNotFound(requestId);
    }

    this.budgetGuard.enforce(
      request,
      { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      requestId,
    );

    let routerResult;
    try {
      routerResult = await this.router.execute(request, decision);
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      const errorLog = this.buildErrorLog(requestId, decision, latencyMs, err);
      await this.logger.log(errorLog);
      throw err;
    }

    const latencyMs = Math.round(performance.now() - start);
    const { providerResult, actualProvider, fallbackTriggered, fallbackFrom } = routerResult;

    const costUsd = estimateCostUsd(
      providerResult.model,
      providerResult.inputTokens,
      providerResult.outputTokens,
    );

    this.budgetGuard.record(request, {
      inputTokens: providerResult.inputTokens,
      outputTokens: providerResult.outputTokens,
      costUsd,
    });

    const usageLog: UsageLog = {
      timestamp: new Date().toISOString(),
      requestId,
      provider: actualProvider.name,
      model: providerResult.model,
      routeRule: decision.rule.name,
      feature: request.feature,
      userTier: request.userTier,
      success: true,
      inputTokens: providerResult.inputTokens,
      outputTokens: providerResult.outputTokens,
      totalTokens: providerResult.totalTokens,
      estimatedCostUsd: costUsd,
      latencyMs,
      fallbackTriggered,
      fallbackFrom,
    };

    await this.logger.log(usageLog);

    return {
      requestId,
      provider: actualProvider.name,
      model: providerResult.model,
      content: providerResult.content,
      inputTokens: providerResult.inputTokens,
      outputTokens: providerResult.outputTokens,
      totalTokens: providerResult.totalTokens,
      estimatedCostUsd: costUsd,
      latencyMs,
      fallbackTriggered,
      fallbackFrom,
    };
  }

  async chatStream(request: GatewayRequest): Promise<GatewayStreamResponse> {
    const requestId = randomUUID();
    const start = performance.now();

    let decision;
    try {
      decision = this.router.resolve(request);
    } catch {
      throw GatewayError.routeNotFound(requestId);
    }

    this.budgetGuard.enforce(
      request,
      { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      requestId,
    );

    let streamRouterResult;
    try {
      streamRouterResult = await this.router.executeStream(request, decision);
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      const errorLog = this.buildErrorLog(requestId, decision, latencyMs, err);
      await this.logger.log(errorLog);
      throw err;
    }

    const { streamResult, actualProvider, fallbackTriggered, fallbackFrom } = streamRouterResult;
    const self = this;

    async function* wrappedStream(): AsyncIterable<GatewayStreamChunk> {
      for await (const chunk of streamResult.stream) {
        yield {
          requestId,
          provider: actualProvider.name,
          delta: chunk.delta,
          model: chunk.model,
          finishReason: chunk.finishReason,
        };
      }
    }

    return {
      requestId,
      stream: wrappedStream(),
      getUsageSummary: async () => {
        const usage = await streamResult.getUsage();
        const latencyMs = Math.round(performance.now() - start);
        const costUsd = estimateCostUsd(usage.model, usage.inputTokens, usage.outputTokens);

        self.budgetGuard.record(request, {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costUsd,
        });

        const usageLog: UsageLog = {
          timestamp: new Date().toISOString(),
          requestId,
          provider: actualProvider.name,
          model: usage.model,
          routeRule: decision.rule.name,
          feature: request.feature,
          userTier: request.userTier,
          success: true,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
          estimatedCostUsd: costUsd,
          latencyMs,
          fallbackTriggered,
          fallbackFrom,
        };

        await self.logger.log(usageLog);

        return {
          requestId,
          provider: actualProvider.name,
          model: usage.model,
          content: usage.content,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
          estimatedCostUsd: costUsd,
          latencyMs,
          fallbackTriggered,
          fallbackFrom,
        };
      },
    };
  }

  listProviders(): string[] {
    return this.registry.list();
  }

  private buildErrorLog(
    requestId: string,
    decision: { rule: { name: string }; provider: { name: string }; model: string },
    latencyMs: number,
    err: unknown,
  ): UsageLog {
    const errorCode =
      err instanceof GatewayError ? err.code : "UNKNOWN";

    return {
      timestamp: new Date().toISOString(),
      requestId,
      provider: decision.provider.name,
      model: decision.model,
      routeRule: decision.rule.name,
      success: false,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      latencyMs,
      errorCode,
    };
  }
}
