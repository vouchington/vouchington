import { beginTransaction } from '@data-stores/psql'
import { mapWithConcurrency } from '@vouchington/utils/async'
import { getIneligiblePurchaseReversalCases } from '@services/memberships/ineligible-stripe-purchase-reversal/case-read'
import { getLockedIneligiblePurchaseReversalCase } from '@services/memberships/ineligible-stripe-purchase-reversal/case-ledger'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runMembershipReversalReadScenarios(lookup: {
  originatingInvoiceId: string
  providerEnvironment: 'test' | 'production'
  providerApplicationId: string
  subscriptionId: string
}): Promise<void> {
  await mapWithConcurrency(
    [
      ['membership-reversal-case-read', 'getIneligiblePurchaseReversalCases'],
      ['membership-reversal-case-locked-read', 'getLockedIneligiblePurchaseReversalCase'],
    ] as const,
    1,
    async ([scenario, label]) => {
      registerScenarioContract(scenario, {
        seededRows: {
          membership_ineligible_purchase_reversal_cases: 2001,
          membership_provider_contexts: 2002,
          membership_provider_lineages: 4002,
          membership_lineage_bindings: 2001,
        },
        expectations: [
          {
            kind: 'maxProcessedRows',
            relation: 'membership_ineligible_purchase_reversal_cases',
            max: 2,
          },
          { kind: 'maxProcessedRows', relation: 'membership_lineage_bindings', max: 2 },
          { kind: 'maxProcessedRows', relation: 'membership_provider_lineages', max: 2 },
          { kind: 'maxProcessedRows', relation: 'membership_provider_contexts', max: 2 },
        ],
      })
      await runAndCapture(
        scenario,
        async () => {
          if (scenario === 'membership-reversal-case-read') {
            // Production passes one page of invoice ids; an absent id shows the probe per id.
            const { originatingInvoiceId, ...scope } = lookup
            const cases = await getIneligiblePurchaseReversalCases({
              ...scope,
              originatingInvoiceIds: [originatingInvoiceId, `${originatingInvoiceId}-absent`],
            })
            if (cases.length !== 1) throw new Error('Expected reversal case')
          } else {
            await using transaction = await beginTransaction()
            if (!(await getLockedIneligiblePurchaseReversalCase(lookup, transaction)))
              throw new Error('Expected locked reversal case')
            await transaction.rollback()
          }
        },
        undefined,
        label,
      )
    },
  )
}
