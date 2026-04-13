import type { ProviderConfig } from "../types/provider.js";
import type { Provider } from "./base.js";
import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenRouterProvider } from "./openrouter.js";

export type ProviderFactory = (config: ProviderConfig) => Provider;

const builtinFactories: Record<string, ProviderFactory> = {
  openai: (c) => new OpenAIProvider(c),
  anthropic: (c) => new AnthropicProvider(c),
  openrouter: (c) => new OpenRouterProvider(c),
};

export class ProviderRegistry {
  private readonly providers = new Map<string, Provider>();
  private readonly customFactories = new Map<string, ProviderFactory>();

  registerFactory(family: string, factory: ProviderFactory): void {
    this.customFactories.set(family, factory);
  }

  load(configs: ProviderConfig[]): void {
    for (const config of configs) {
      if (config.enabled === false) continue;

      const factory =
        this.customFactories.get(config.provider) ??
        builtinFactories[config.provider];

      if (!factory) {
        throw new Error(
          `No provider factory for family "${config.provider}" (entry: "${config.name}")`,
        );
      }

      try {
        this.providers.set(config.name, factory(config));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[gateway] Skipping provider "${config.name}": ${msg}`);
      }
    }
  }

  get(name: string): Provider | undefined {
    return this.providers.get(name);
  }

  require(name: string): Provider {
    const p = this.providers.get(name);
    if (!p) throw new Error(`Provider "${name}" not found in registry`);
    return p;
  }

  list(): string[] {
    return [...this.providers.keys()];
  }
}
