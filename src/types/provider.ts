export interface ProviderAuth {
  type: "apiKey" | "bearer" | "none" | "customHeader";
  envVar?: string;
  headerName?: string;
}

export interface ProviderRetry {
  maxAttempts?: number;
  backoffMs?: number;
}

export interface ProviderConfig {
  name: string;
  provider: string;
  baseUrl?: string;
  enabled?: boolean;
  defaultModel?: string;
  models: string[];
  timeoutMs?: number;
  retry?: ProviderRetry;
  auth: ProviderAuth;
  headers?: Record<string, string>;
}
