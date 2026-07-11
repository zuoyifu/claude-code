import type { QueryLoopParams } from './types.js'

/**
 * 单次 API 请求 —— 返回流。
 * v2 spec §7.2: API 层不知道 turn 循环、不知道 session。
 *
 * 委托模式 B（Promise<AsyncIterable>）：调用方 await callApi(...) 后再 for await of。
 */
export async function callApi(
  params: QueryLoopParams,
  messages: QueryLoopParams['messages'],
): Promise<AsyncIterable<unknown>> {
  const client = await getClient(params.apiConfig)
  const stream = await client.messages.stream({
    model: params.model,
    max_tokens: params.maxTokens ?? 8192,
    system: params.systemPrompt,
    messages: messages as never,
    tools: params.tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    })),
  })
  return stream as AsyncIterable<unknown>
}

type ApiClient = {
  messages: {
    stream: (req: unknown) => Promise<AsyncIterable<unknown>>
  }
}

async function getClient(
  config: QueryLoopParams['apiConfig'],
): Promise<ApiClient> {
  // 根据 provider 选择 client
  switch (config.provider) {
    case 'firstParty': {
      const { Anthropic } = await import('@anthropic-ai/sdk')
      return new Anthropic({ apiKey: config.apiKey }) as unknown as ApiClient
    }
    case 'openai': {
      const mod = await import('../services/api/openai/client.js')
      return (
        mod as unknown as { createOpenaiClient: (c: unknown) => ApiClient }
      ).createOpenaiClient(config)
    }
    case 'gemini': {
      const mod = await import('../services/api/gemini/client.js')
      return (
        mod as unknown as { createGeminiClient: (c: unknown) => ApiClient }
      ).createGeminiClient(config)
    }
    case 'grok': {
      const mod = await import('../services/api/grok/client.js')
      return (
        mod as unknown as { createGrokClient: (c: unknown) => ApiClient }
      ).createGrokClient(config)
    }
    default:
      throw new Error(`Unknown provider: ${config.provider}`)
  }
}
