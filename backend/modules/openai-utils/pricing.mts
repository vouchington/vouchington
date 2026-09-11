import type { OpenAIUsage } from './create-response.mts'

type TokenPrices = {
  inputMicrounitsPerMillionTokens: number
  cachedInputMicrounitsPerMillionTokens: number
  outputMicrounitsPerMillionTokens: number
}

// Source: https://platform.openai.com/docs/pricing, retrieved 2026-07-28 by parsing the tier
// tables directly (the rendered page summary is unreliable for numeric tables). USD/1M tokens
// converted to microunits/1M at 1:1. `gpt-5.4-nano` has no Priority-tier row and no billable
// cache-write dimension — both are absent from OpenAI's own table, not merely unimplemented
// here, so neither is represented below. A future GPT-5.6 migration (which does bill cache
// writes) is a one-line addition to this const, per "edit migrations/pricing in place."
const SUPPORTED_MODEL_TIERS = {
  'gpt-5.4-nano': {
    default: {
      inputMicrounitsPerMillionTokens: 200_000,
      cachedInputMicrounitsPerMillionTokens: 20_000,
      outputMicrounitsPerMillionTokens: 1_250_000,
    },
    flex: {
      inputMicrounitsPerMillionTokens: 100_000,
      cachedInputMicrounitsPerMillionTokens: 10_000,
      outputMicrounitsPerMillionTokens: 625_000,
    },
  },
} as const satisfies Record<string, Record<string, TokenPrices>>

export type SupportedModel = keyof typeof SUPPORTED_MODEL_TIERS
export type SupportedServiceTier = {
  [Model in SupportedModel]: keyof (typeof SUPPORTED_MODEL_TIERS)[Model]
}[SupportedModel]

/** The request-side tier for background/batch-tolerant agents — half the standard price. */
export const FLEX_SERVICE_TIER: SupportedServiceTier = 'flex'

/**
 * OpenAI's returned `response.model` is a dated snapshot (e.g. `gpt-5.4-nano-2026-03-17`), not
 * the bare alias the pricing table is keyed by. Strip it here, at the lookup, so every caller
 * gets normalized pricing for free while the raw snapshot stays untouched for the ledger's
 * `model` column — the exact snapshot is strictly more informative for an audit trail than the
 * alias, and OpenAI prices uniformly across snapshots of one alias.
 */
function normalizeModelAlias(model: string): string {
  return model.replace(/-\d{4}-\d{2}-\d{2}$/, '')
}

function getTokenPrices(model: string, serviceTier: string): TokenPrices | null {
  const alias = normalizeModelAlias(model)
  const tiers = (SUPPORTED_MODEL_TIERS as Record<string, Record<string, TokenPrices>>)[alias]
  return tiers?.[serviceTier] ?? null
}

/**
 * Clamps a response's reported cached-token count to its total input tokens. OpenAI's usage
 * shape does not itself guarantee `cached_tokens <= input_tokens`; both the cost calculation
 * and the ledger's persisted `cached_input_tokens` column must derive from this single
 * normalized value so a stored row's cost is always reproducible from its stored inputs.
 */
export function normalizeCachedInputTokens(usage: OpenAIUsage): number {
  return Math.min(usage.input_tokens, Math.max(0, usage.input_tokens_details?.cached_tokens ?? 0))
}

export function calcCostMicrounits(
  model: string,
  serviceTier: string,
  usage: OpenAIUsage,
): number | null {
  const prices = getTokenPrices(model, serviceTier)
  if (!prices) {
    console.warn(`calcCostMicrounits: no pricing entry for ${model}:${serviceTier}`)
    return null
  }
  const cachedTokens = normalizeCachedInputTokens(usage)
  const uncachedInputTokens = Math.max(0, usage.input_tokens - cachedTokens)
  const numerator =
    BigInt(uncachedInputTokens) * BigInt(prices.inputMicrounitsPerMillionTokens) +
    BigInt(cachedTokens) * BigInt(prices.cachedInputMicrounitsPerMillionTokens) +
    BigInt(usage.output_tokens) * BigInt(prices.outputMicrounitsPerMillionTokens)
  const million = 1_000_000n
  const rounded = (numerator + million / 2n) / million
  const result = Number(rounded)
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('AI usage cost exceeds the maximum JSON-safe integer')
  }
  return result
}
