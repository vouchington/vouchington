import { beginTransaction } from '@data-stores/psql'
import { mapWithConcurrency } from '@vouchington/utils/async'
import {
  recordIneligibleStripePurchaseCaseForCollision,
  type IneligibleStripePurchaseCaseInput,
} from '@services/memberships/ineligible-stripe-purchase-reversal/case-creation'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runMembershipReversalBindingScenarios(
  input: IneligibleStripePurchaseCaseInput,
): Promise<void> {
  await mapWithConcurrency(
    [
      ['membership-reversal-bind-provider-lineage', 'createMembership: bind provider lineage'],
      ['membership-reversal-lock-provider-binding', 'createMembership: lock provider binding'],
    ] as const,
    1,
    async ([scenario, label]) => {
      registerScenarioContract(scenario, {
        seededRows: { membership_lineage_bindings: 2001 },
        expectations: [
          { kind: 'maxProcessedRows', relation: 'membership_lineage_bindings', max: 2 },
        ],
      })
      await runAndCapture(
        scenario,
        async () => {
          await using transaction = await beginTransaction()
          await recordIneligibleStripePurchaseCaseForCollision(input, transaction)
          await transaction.rollback()
        },
        undefined,
        label,
      )
    },
  )
}
