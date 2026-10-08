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

/**
 * Provider-neutral token usage. `inputTokens` counts every prompt token, including the cache reads
 * and cache writes; the cache fields say how much of it was billed at the cache rates.
 */
export type ModelUsage = {
  inputTokens: number
  cacheReadTokens: number
  /** Cache writes at the provider's default (5-minute) retention. */
  cacheWrite5mTokens: number
  cacheWrite1hTokens: number
  /** Includes the reasoning tokens. */
  outputTokens: number
  reasoningOutputTokens: number
  /** The provider-reported USD cost for the call (OpenRouter `usage.cost`), when present. */
  reportedCostUsd?: number
}

export type JsonSchema = Record<string, unknown>

export type GenerateJsonRequest<T> = {
  instructions: string
  input: string
  /** The name the schema is registered under at providers that need one. */
  schemaName: string
  schema: JsonSchema
  /** Narrows the schema-valid JSON into the caller's type; throws when it does not fit. */
  parse: (value: unknown) => T
  maxOutputTokens: number
  /** An opaque, stable identifier for the end user, for provider abuse monitoring. */
  safetyIdentifier?: string
  /** A stable prefix key that improves prompt-cache hits at providers that take one. */
  promptCacheKey?: string
  /** Background work that tolerates the slower, cheaper flex tier where a provider has one. */
  flex?: boolean
  maxRetries?: number
  /** Rejected by the layer for models that do not accept them; no agent sets them today. */
  temperature?: number
  topP?: number
  topK?: number
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
