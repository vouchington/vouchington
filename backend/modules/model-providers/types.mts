/** The model providers every model-backed agent can run on. */
export const MODEL_PROVIDERS = ['anthropic', 'openai'] as const
export type ModelProvider = (typeof MODEL_PROVIDERS)[number]

/**
 * How an OpenAI call reaches OpenAI. One global setting (`ai-model-routing.openai_transport`)
 * picks it, so it is never part of a caller's options. Anthropic has a single direct transport.
 */
export const OPENAI_TRANSPORTS = ['openrouter', 'direct'] as const
export type OpenAITransport = (typeof OPENAI_TRANSPORTS)[number]

/** The `{ provider, model }` a caller passes to an agent entry point. */
export type ModelSelection = {
  provider: ModelProvider
  model: string
}
