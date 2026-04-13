# ai-gateway-lite

面向 Node.js 的轻量级 AI 网关 — 多模型路由、自动降级、预算控制、用量日志，零运行时依赖。

[![CI](https://github.com/hyxnj666-creator/ai-gateway-lite/actions/workflows/ci.yml/badge.svg)](https://github.com/hyxnj666-creator/ai-gateway-lite/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D18-green)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

[English](./README.md) | **中文**

## 为什么需要它

当你同时接入多个 LLM 服务商（OpenAI、Anthropic、OpenRouter 等），总会反复遇到这些问题：

- **请求该发给谁？** → 路由规则
- **某个服务挂了怎么办？** → 降级链
- **怎么控制成本？** → 预算守卫
- **到底花了多少钱？** → 用量日志 + 成本估算

`ai-gateway-lite` 用一个零依赖的 TypeScript 库，一次性解决这四个问题。

## 核心能力

| 能力 | 说明 |
|------|------|
| **多模型路由** | 按 `taskType`、`feature`、`userTier` 或任意组合匹配路由，优先级排序 |
| **自动降级** | 支持 `timeout`、`rate_limit`、`provider_error`、`budget_exceeded` 触发的降级链 |
| **预算控制** | 按请求 / 小时 / 天 / 月限制 token 和成本，支持 soft（告警）和 hard（拦截）模式 |
| **流式响应 (SSE)** | 所有 Provider 均支持 `chatStream()`，返回 `AsyncIterable<StreamChunk>` |
| **成本估算** | 内置 OpenAI 和 Anthropic 定价表，支持注册自定义模型定价 |
| **重试 + 退避** | 可按 Provider 配置重试次数和指数退避，仅对 429/502/503/504 重试 |
| **配置校验** | 加载时自动校验所有字段，报错信息精确到字段路径 |
| **类型化错误** | `GatewayError` 携带 `kind`、`httpStatus`、`retryable` 标记，自动分类上游 HTTP 状态码 |
| **用量日志** | 每次请求生成结构化 `UsageLog`，支持自定义 handler |
| **零依赖** | 使用原生 `fetch`，不依赖 `openai`、`@anthropic-ai/sdk` 等任何 SDK |

## 快速开始

```bash
npm install ai-gateway-lite
```

**1. 设置环境变量**（或用你项目自己的方式加载）：

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
```

**2. 创建配置文件**（完整配置说明见 [配置详解](#配置详解)）：

```
your-project/
  config/
    gateway.providers.json
    gateway.routes.json
    gateway.budgets.json
```

**3. 在代码中使用：**

```typescript
import { Gateway, loadConfig } from "ai-gateway-lite";

const config = await loadConfig("./config");

const gateway = new Gateway({
  config,
  onUsageLog: (log) => console.log(log),
});

const response = await gateway.chat({
  messages: [{ role: "user", content: "用一句话解释量子计算" }],
  taskType: "chat",
});

console.log(response.content);
console.log(`费用: $${response.estimatedCostUsd.toFixed(4)}`);
```

也可以跳过配置文件，直接传对象：

```typescript
import { Gateway, loadConfigFromObjects } from "ai-gateway-lite";

const config = loadConfigFromObjects({
  providers: [
    { name: "openai", provider: "openai", models: ["gpt-4o-mini"], auth: { type: "apiKey", envVar: "OPENAI_API_KEY" } },
  ],
  routes: {
    rules: [{ name: "default", priority: 0, match: {}, target: { provider: "openai" } }],
  },
  budgets: [],
});

const gateway = new Gateway({ config });
const res = await gateway.chat({ messages: [{ role: "user", content: "你好！" }] });
```

### 流式调用

```typescript
const stream = await gateway.chatStream({
  messages: [{ role: "user", content: "写一首关于 TypeScript 的俳句" }],
});

for await (const chunk of stream.stream) {
  process.stdout.write(chunk.delta);
}

const summary = await stream.getUsageSummary();
console.log(`\n\nTokens: ${summary.totalTokens}, 费用: $${summary.estimatedCostUsd.toFixed(4)}`);
```

### Demo 服务

```bash
git clone https://github.com/hyxnj666-creator/ai-gateway-lite.git
cd ai-gateway-lite
npm install
cp .env.example .env   # 填入你的 API Key
npm run demo
```

服务启动在 `http://localhost:3170`，提供三个端点：

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/v1/chat` | 非流式对话 |
| `POST` | `/v1/chat/stream` | SSE 流式对话 |
| `GET` | `/health` | 健康检查 + Provider 列表 |

```bash
curl -X POST http://localhost:3170/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello!"}],"taskType":"chat"}'
```

## 配置详解

三份 JSON 文件控制网关行为：

### `gateway.providers.json` — Provider 注册

```json
[
  {
    "name": "openai-main",
    "provider": "openai",
    "models": ["gpt-4o", "gpt-4o-mini"],
    "defaultModel": "gpt-4o-mini",
    "timeoutMs": 30000,
    "retry": { "maxAttempts": 2, "backoffMs": 1000 },
    "auth": { "type": "apiKey", "envVar": "OPENAI_API_KEY" }
  },
  {
    "name": "anthropic-main",
    "provider": "anthropic",
    "models": ["claude-sonnet-4-20250514"],
    "defaultModel": "claude-sonnet-4-20250514",
    "timeoutMs": 60000,
    "auth": { "type": "apiKey", "envVar": "ANTHROPIC_API_KEY" }
  }
]
```

### `gateway.routes.json` — 路由规则与降级链

```json
{
  "rules": [
    {
      "name": "premium-complex",
      "priority": 100,
      "match": { "taskType": "complex", "userTier": "premium" },
      "target": {
        "provider": "anthropic-main",
        "model": "claude-sonnet-4-20250514",
        "fallbackChain": "complex-fallback"
      }
    },
    {
      "name": "default-chat",
      "priority": 10,
      "match": {},
      "target": { "provider": "openai-main", "model": "gpt-4o-mini" }
    }
  ],
  "fallbackChains": [
    {
      "name": "complex-fallback",
      "steps": [
        { "provider": "anthropic-main" },
        { "provider": "openai-main", "model": "gpt-4o", "when": ["timeout", "provider_error"] },
        { "provider": "openrouter-fallback", "when": ["timeout", "rate_limit", "provider_error"] }
      ]
    }
  ]
}
```

### `gateway.budgets.json` — 预算策略

```json
[
  {
    "name": "global-daily",
    "scope": { "type": "global" },
    "window": "day",
    "limits": { "maxTotalTokens": 1000000, "maxCostUsd": 10.0, "warnAt": 0.8 },
    "enforcement": "hard"
  }
]
```

## 路由流程

```
请求 → 匹配规则 (taskType / feature / userTier)
     → 选出最高优先级的规则
     → 解析 provider + model
     → 如果配置了降级链:
           尝试步骤 1 → 失败? → 分类错误
           → 尝试步骤 2 (如果触发条件匹配 `when`) → ...
     → 预算检查 (调用前) → 执行 → 记录用量 (调用后)
     → 写入 UsageLog → 返回 GatewayResponse
```

## API 参考

### `Gateway`

```typescript
const gateway = new Gateway({
  config: GatewayConfig,
  onUsageLog?: (log: UsageLog) => void,
  customProviders?: Record<string, ProviderFactory>,
});

gateway.chat(request: GatewayRequest): Promise<GatewayResponse>
gateway.chatStream(request: GatewayRequest): Promise<GatewayStreamResponse>
gateway.listProviders(): string[]
```

### `GatewayRequest`

```typescript
interface GatewayRequest {
  messages: ChatMessage[];
  model?: string;        // 覆盖路由指定的模型
  taskType?: string;     // 路由维度
  feature?: string;      // 路由维度
  userTier?: string;     // 路由维度
  maxTokens?: number;
  temperature?: number;
}
```

### `GatewayResponse`

```typescript
interface GatewayResponse {
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
```

### 自定义 Provider

```typescript
import { Gateway, loadConfig } from "ai-gateway-lite";
import type { Provider, ProviderRequestOptions, ProviderResult } from "ai-gateway-lite";

class MyProvider implements Provider {
  readonly name = "my-provider";
  readonly family = "custom";

  async chat(options: ProviderRequestOptions): Promise<ProviderResult> {
    // 你的实现
  }
}

const gateway = new Gateway({
  config: await loadConfig("./config"),
  customProviders: {
    custom: (config) => new MyProvider(),
  },
});
```

### 自定义定价

```typescript
import { registerModelPricing } from "ai-gateway-lite";

registerModelPricing("my-custom-model", {
  inputPer1kTokens: 0.001,
  outputPer1kTokens: 0.002,
});
```

### 错误处理

```typescript
import { GatewayError } from "ai-gateway-lite";

try {
  await gateway.chat(request);
} catch (err) {
  if (err instanceof GatewayError) {
    console.log(err.kind);       // "provider_timeout" | "provider_rate_limit" | "budget_exceeded" | ...
    console.log(err.httpStatus);  // 504, 429, ...
    console.log(err.retryable);   // true/false
    console.log(err.toJSON());    // 可序列化的错误对象
  }
}
```

## 项目结构

```
src/
  types/        类型定义
  providers/    Provider 接口 + OpenAI、Anthropic、OpenRouter 适配器 + 重试逻辑
  config/       配置加载器 + 字段级校验器
  routing/      路由匹配 + 降级链执行器
  budget/       内存预算追踪 + 预算守卫
  pricing/      模型定价表 + 成本估算器
  logging/      用量日志 + 可插拔 handler
  errors/       GatewayError + HTTP 状态码自动分类
  gateway.ts    Gateway 主类
  index.ts      公共 API 导出
demo/
  server.ts     本地 HTTP demo 服务
  *.json        示例配置文件
```

## 内置 Provider

| Provider | Family | 流式支持 | 鉴权方式 |
|----------|--------|---------|---------|
| OpenAI | `openai` | 支持 | Bearer token (`OPENAI_API_KEY`) |
| Anthropic | `anthropic` | 支持 | `x-api-key` header (`ANTHROPIC_API_KEY`) |
| OpenRouter | `openrouter` | 支持 | Bearer token (`OPENROUTER_API_KEY`) |

## 开发

```bash
npm run typecheck   # TypeScript 严格类型检查
npm test            # 运行全部 84 项测试
npm run test:watch  # 监听模式
npm run build       # 构建 JS + 类型声明
npm run demo        # 启动 demo 服务
```

## 协议

[MIT](./LICENSE)
