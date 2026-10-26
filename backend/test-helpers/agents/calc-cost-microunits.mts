import {
  calcCostMicrounits as calcListCostMicrounits,
  type ModelUsage,
} from '@vouchington/ai/providers'
import { MODEL_PRICES } from '../../modules/model-providers/pricing-table.mts'

/** List-price cost of one call in USD microunits, or null when the served model/tier is unpriced. */
export function calcCostMicrounits(
  provider: string,
  model: string,
  serviceTier: string,
  usage: ModelUsage,
): number | null {
  return calcListCostMicrounits(MODEL_PRICES, provider, model, serviceTier, usage)
}
