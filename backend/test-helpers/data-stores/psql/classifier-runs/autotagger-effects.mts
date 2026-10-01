import { beginTransaction } from '@data-stores/psql'
import {
  createAutotaggerRunAdapter,
  type AutotaggerRunConfiguration,
} from '../../../../services/autotagger/index.mts'
import type { ClassifierRunLease } from '../../../../services/classifier-runs/index.mts'

/**
 * Applies a lease's autotagger effects in a transaction of its own, with no local outcome and no
 * remote decision. It is for asserting how the adapter reacts to a run missing its decision; the
 * transaction rolls back when the helper returns or throws.
 */
export async function applyAutotaggerEffectsWithoutDecisionForTest(
  lease: ClassifierRunLease<AutotaggerRunConfiguration>,
): Promise<unknown> {
  await using query = await beginTransaction()
  return await createAutotaggerRunAdapter().applyEffects(query, lease, {
    local: null,
    remoteDecision: null,
  })
}
