export { Gateway } from "./gateway.js";
export type { GatewayOptions } from "./gateway.js";

export { loadConfig, loadConfigFromObjects, validateConfig } from "./config/index.js";
export type { GatewayConfig, ConfigPaths, ValidationError } from "./config/index.js";

export { ProviderRegistry, OpenAIProvider, AnthropicProvider, OpenRouterProvider } from "./providers/index.js";
export type { Provider, ProviderRequestOptions, ProviderResult, StreamChunk, StreamResult, ProviderFactory } from "./providers/index.js";

export { Router } from "./routing/index.js";
export type { RouteDecision, RouterResult } from "./routing/index.js";

export { BudgetGuard, BudgetTracker } from "./budget/index.js";
export type { BudgetCheckResult } from "./budget/index.js";

export { UsageLogger } from "./logging/index.js";
export type { UsageLogHandler } from "./logging/index.js";

export { GatewayError } from "./errors/index.js";

export { estimateCostUsd, getModelPricing, registerModelPricing } from "./pricing/index.js";
export type { ModelPricing } from "./pricing/index.js";

export type {
  ProviderConfig,
  ProviderAuth,
  ProviderRetry,
  RouteRule,
  RouteMatch,
  RouteTarget,
  RouteConstraints,
  FallbackChain,
  FallbackStep,
  FallbackTrigger,
  BudgetPolicy,
  BudgetScope,
  BudgetLimits,
  UsageLog,
  GatewayErrorKind,
  GatewayErrorPayload,
  ChatMessage,
  GatewayRequest,
  GatewayResponse,
  GatewayStreamChunk,
  GatewayStreamResponse,
} from "./types/index.js";
