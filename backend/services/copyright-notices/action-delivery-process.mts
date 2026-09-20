import {
  getCopyrightActionDeliveryDependencies,
  type CopyrightActionDeliveryDependencies,
} from './action-delivery-dependencies.mts'
import { executeCopyrightActionIntent } from './action-delivery-execution.mts'
import { claimCopyrightActionIntent } from './action-delivery-state.mts'

/** Applies a claimed legal action through a placement-fenced, fail-closed edge projection. */
export async function processCopyrightActionIntent(
  intentId: string,
  now = new Date(),
  dependencies: Partial<CopyrightActionDeliveryDependencies> = {},
): Promise<'applied' | 'stale' | 'blocked' | 'not_claimed'> {
  const intent = await claimCopyrightActionIntent(intentId, now)
  if (!intent) return 'not_claimed'
  return await executeCopyrightActionIntent(
    intent,
    now,
    getCopyrightActionDeliveryDependencies(dependencies),
  )
}
