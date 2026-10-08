import { MODEL_PRICES, type PriceTable, type TokenRates } from './pricing-table.mts'
import type { LedgerModelProvider, ModelProvider, ModelUsage } from './types.mts'

/**
 * Providers return a dated snapshot or a routed name (`gpt-6-luna-2026-10-01`,
 * `openai/gpt-6-luna`), not the bare alias the price table is keyed by. Strip both at the lookup so
 * every caller gets normalized pricing while the ledger keeps the exact served name for audit.
 */
export function normalizeModelAlias(model: string): string {
  return model.replace(/^[a-z0-9-]+\//, '').replace(/-(\d{4}-\d{2}-\d{2}|\d{8})$/, '')
}

const PRICES: PriceTable = MODEL_PRICES

/** The model aliases that have a price row, per provider. A model without one cannot be selected. */
export function getPricedModels(provider: ModelProvider): readonly string[] {
  return Object.keys(PRICES[provider])
}

export function isPricedModel(provider: ModelProvider, model: string): boolean {
  return Object.hasOwn(PRICES[provider], model)
}

function findRates(
  provider: LedgerModelProvider,
  model: string,
  serviceTier: string,
  promptTokens: number,
): TokenRates | null {
  if (provider === 'typesafe') return null
  const tiers = PRICES[provider][normalizeModelAlias(model)]
  const bands = tiers && Object.hasOwn(tiers, serviceTier) ? tiers[serviceTier] : undefined
  return bands?.find(band => promptTokens <= band.maxPromptTokens)?.rates ?? null
}

/** Uses a provider's authoritative billed USD cost when one is present (OpenRouter `usage.cost`). */
export function getReportedCostMicrounits(usage: ModelUsage): number | null {
  if (usage.reportedCostUsd === undefined) return null
  if (!Number.isFinite(usage.reportedCostUsd) || usage.reportedCostUsd < 0)
    throw new TypeError('Provider usage cost must be a non-negative finite USD amount')
  const microunits = Math.round(usage.reportedCostUsd * 1_000_000)
  if (!Number.isSafeInteger(microunits))
    throw new RangeError('Provider usage cost exceeds the maximum JSON-safe integer')
  return microunits
}

/**
 * The list-price cost of one call in scale-six USD microunits, or null when the served
 * model/tier has no price row (or the call used a cache-write dimension the provider publishes no
 * rate for). The price band is chosen by the whole prompt: uncached input, cache writes and cache
 * reads together, and it prices the output too. This is list price: it ignores whether prepaid
 * credits paid for the call.
 */
export function calcCostMicrounits(
  provider: LedgerModelProvider,
  model: string,
  serviceTier: string,
  usage: ModelUsage,
): number | null {
  const rates = findRates(provider, model, serviceTier, usage.inputTokens)
  if (!rates) return null
  if (usage.cacheWrite5mTokens > 0 && rates.cacheWrite5m === null) return null
  if (usage.cacheWrite1hTokens > 0 && rates.cacheWrite1h === null) return null
  const cached = usage.cacheReadTokens + usage.cacheWrite5mTokens + usage.cacheWrite1hTokens
  const uncached = Math.max(0, usage.inputTokens - cached)
  const numerator =
    BigInt(uncached) * BigInt(rates.input) +
    BigInt(usage.cacheReadTokens) * BigInt(rates.cacheRead) +
    BigInt(usage.cacheWrite5mTokens) * BigInt(rates.cacheWrite5m ?? 0) +
    BigInt(usage.cacheWrite1hTokens) * BigInt(rates.cacheWrite1h ?? 0) +
    BigInt(usage.outputTokens) * BigInt(rates.output)
  const rounded = (numerator + 500_000n) / 1_000_000n
  const result = Number(rounded)
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('AI usage cost exceeds the maximum JSON-safe integer')
  }
  return result
}
