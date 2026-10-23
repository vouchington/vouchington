import type { ModelUsage } from '@vouchington/ai/providers'
/** The model providers every model-backed agent can run on. */
export const MODEL_PROVIDERS = ['anthropic', 'openai'] as const
export type ModelProvider = (typeof MODEL_PROVIDERS)[number]

/**
 * How an OpenAI call reaches OpenAI. One global setting (`ai-model-routing.openai_transport`)
 * picks it, so it is never part of a caller's options. Anthropic has a single direct transport.
 */
export const OPENAI_TRANSPORTS = ['openrouter', 'direct'] as const
export type OpenAITransport = (typeof OPENAI_TRANSPORTS)[number]

/** Every transport a ledger row can name, including the jev classifier transport. */
export type ProviderTransport = OpenAITransport | 'typesafe'

/**
 * Who makes the model a ledger row bills for. The jev classifiers run TypeSafe's model, whichever
 * transport reaches it, so their rows name `typesafe`; no agent can be routed to it.
 */
export type LedgerModelProvider = ModelProvider | 'typesafe'

/** The `{ provider, model }` a caller passes to an agent entry point. */
export type ModelSelection = {
  provider: ModelProvider
  model: string
}

/** One provider response that was billed, with everything the usage ledger needs. */
export type BilledModelResponse = {
  provider: ModelProvider
  transport: OpenAITransport
  /** The model the provider says it served (a dated snapshot, not necessarily the alias). */
  model: string
  responseId: string
  serviceTier: string
  usage: ModelUsage
}

export type ModelCallResult<T> = BilledModelResponse & { output: T }
