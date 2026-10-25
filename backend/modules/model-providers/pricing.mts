import {
  type ModelUsage,
  calcCostMicrounits as calcListCostMicrounits,
  getPricedModels as getPricedModelsIn,
  isPricedModel as isPricedModelIn,
} from '@vouchington/ai/providers'
import { MODEL_PRICES } from './pricing-table.mts'
import type { ModelProvider } from './types.mts'

/** The model aliases that have a price row, per provider. A model without one cannot be selected. */
export function getPricedModels(provider: ModelProvider): readonly string[] {
  return getPricedModelsIn(MODEL_PRICES, provider)
}

export function isPricedModel(provider: ModelProvider, model: string): boolean {
  return isPricedModelIn(MODEL_PRICES, provider, model)
}

/** List-price cost of one call in USD microunits, or null when the served model/tier is unpriced. */
export function calcCostMicrounits(
  provider: string,
  model: string,
  serviceTier: string,
  usage: ModelUsage,
): number | null {
  return calcListCostMicrounits(MODEL_PRICES, provider, model, serviceTier, usage)
}
