export interface ModelPricing {
  inputPer1kTokens: number;
  outputPer1kTokens: number;
}

const table: Record<string, ModelPricing> = {
  // OpenAI
  "gpt-4o":             { inputPer1kTokens: 0.0025, outputPer1kTokens: 0.01 },
  "gpt-4o-mini":        { inputPer1kTokens: 0.00015, outputPer1kTokens: 0.0006 },
  "gpt-4-turbo":        { inputPer1kTokens: 0.01, outputPer1kTokens: 0.03 },
  "gpt-4":              { inputPer1kTokens: 0.03, outputPer1kTokens: 0.06 },
  "gpt-3.5-turbo":      { inputPer1kTokens: 0.0005, outputPer1kTokens: 0.0015 },
  "o1":                 { inputPer1kTokens: 0.015, outputPer1kTokens: 0.06 },
  "o1-mini":            { inputPer1kTokens: 0.003, outputPer1kTokens: 0.012 },
  "o3-mini":            { inputPer1kTokens: 0.0011, outputPer1kTokens: 0.0044 },

  // Anthropic
  "claude-3-opus-20240229":   { inputPer1kTokens: 0.015, outputPer1kTokens: 0.075 },
  "claude-3-sonnet-20240229": { inputPer1kTokens: 0.003, outputPer1kTokens: 0.015 },
  "claude-3-haiku-20240307":  { inputPer1kTokens: 0.00025, outputPer1kTokens: 0.00125 },
  "claude-3.5-sonnet-20241022": { inputPer1kTokens: 0.003, outputPer1kTokens: 0.015 },
  "claude-sonnet-4-20250514": { inputPer1kTokens: 0.003, outputPer1kTokens: 0.015 },
  "claude-4-opus-20250918":   { inputPer1kTokens: 0.015, outputPer1kTokens: 0.075 },
};

const aliasMap: Record<string, string> = {
  "claude-3-opus": "claude-3-opus-20240229",
  "claude-3-sonnet": "claude-3-sonnet-20240229",
  "claude-3-haiku": "claude-3-haiku-20240307",
  "claude-3.5-sonnet": "claude-3.5-sonnet-20241022",
};

export function getModelPricing(model: string): ModelPricing | undefined {
  return table[model] ?? table[aliasMap[model] ?? ""];
}

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = getModelPricing(model);
  if (!pricing) return 0;

  return (
    (inputTokens / 1000) * pricing.inputPer1kTokens +
    (outputTokens / 1000) * pricing.outputPer1kTokens
  );
}

export function registerModelPricing(model: string, pricing: ModelPricing): void {
  table[model] = pricing;
}
