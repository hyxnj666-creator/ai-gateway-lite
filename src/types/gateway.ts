export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GatewayRequest {
  messages: ChatMessage[];
  model?: string;
  taskType?: string;
  feature?: string;
  userTier?: string;
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface GatewayResponse {
  requestId: string;
  provider: string;
  model: string;
  content: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  fallbackTriggered: boolean;
  fallbackFrom?: string;
}

export interface GatewayStreamChunk {
  requestId: string;
  provider: string;
  delta: string;
  model?: string;
  finishReason?: string | null;
}

export interface GatewayStreamResponse {
  requestId: string;
  stream: AsyncIterable<GatewayStreamChunk>;
  getUsageSummary: () => Promise<GatewayResponse>;
}
