import {
  calcCostMicrounits as calculateCost,
  getPricedModels as listModels,
  isPricedModel as hasPrice,
  type ModelUsage,
} from '@vouchington/ai/providers'
import { MODEL_PRICES } from './pricing-table.mts'
import type { LedgerModelProvider, ModelProvider } from './types.mts'

export function getPricedModels(provider: ModelProvider): readonly string[] {
  return listModels(MODEL_PRICES, provider)
}
export function isPricedModel(provider: ModelProvider, model: string): boolean {
  return hasPrice(MODEL_PRICES, provider, model)
}
export function calcCostMicrounits(
  provider: LedgerModelProvider,
  model: string,
  serviceTier: string,
  usage: ModelUsage,
): number | null {
  return calculateCost(MODEL_PRICES, provider, model, serviceTier, usage)
}
