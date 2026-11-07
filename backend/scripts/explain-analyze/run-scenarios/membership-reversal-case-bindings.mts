import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { mapWithConcurrency } from '@vouchington/utils/async'
import {
  recordIneligibleStripePurchaseCaseForCollision,
  type IneligibleStripePurchaseCaseInput,
} from '@services/memberships/ineligible-stripe-purchase-reversal/case-creation'
import { registerScenarioContract } from '../plan-expectations.mts'
import { collectPlanNodes } from '../plan-nodes.mts'
import { getResults, runAndCapture } from '../run-support.mts'

export async function runMembershipReversalBindingScenarios(
  input: IneligibleStripePurchaseCaseInput,
): Promise<void> {
  // Keep the lineage committed but its binding absent: the captured INSERT can then insert a
  // real row during both rolled-back EXPLAIN passes rather than taking ON CONFLICT DO NOTHING.
  const newSourceIdentity = {
    ...input.sourceIdentity,
    providerLineageId: `explain-unbound-${randomUUID()}`,
  }
  await write(
    `/* seedUnboundReversalLineage */
      INSERT INTO membership_provider_lineages
        (membership_provider_context_id, provider_lineage_id, provider_account_id)
      VALUES (fn_upsert_membership_provider_context_id('stripe', $1, $2), $3, $4)`,
    [
      newSourceIdentity.environment,
      newSourceIdentity.applicationId,
      newSourceIdentity.providerLineageId,
      newSourceIdentity.providerAccountId ?? null,
    ],
  )
  await mapWithConcurrency(
    [
      ['membership-reversal-bind-provider-lineage', 'createMembership: bind provider lineage'],
      ['membership-reversal-lock-provider-binding', 'createMembership: lock provider binding'],
    ] as const,
    1,
    async ([scenario, label]) => {
      registerScenarioContract(scenario, {
        // INSERT without RETURNING has zero root rows; assert the write and input node below.
        allowEmptyResult: scenario === 'membership-reversal-bind-provider-lineage',
        seededRows: { membership_lineage_bindings: 2001 },
        expectations: [
          { kind: 'maxProcessedRows', relation: 'membership_lineage_bindings', max: 2 },
        ],
      })
      await runAndCapture(
        scenario,
        async () => {
          await using transaction = await beginTransaction()
          const created = await recordIneligibleStripePurchaseCaseForCollision(
            scenario === 'membership-reversal-bind-provider-lineage'
              ? { ...input, sourceIdentity: newSourceIdentity }
              : input,
            transaction,
          )
          if (scenario === 'membership-reversal-bind-provider-lineage' && !created)
            throw new Error('Expected a new case using the unbound lineage')
          await transaction.rollback()
        },
        undefined,
        label,
      )
      if (scenario === 'membership-reversal-bind-provider-lineage') {
        const plans = getResults().filter(result => result.scenario_id === scenario)
        if (plans.length === 0) throw new Error('Expected captured binding insert plans')
        for (const result of plans) {
          const [root, ...children] = collectPlanNodes(result.plan)
          if (root?.['Tuples Inserted'] !== 1 || !children.some(node => node['Actual Rows'] === 1))
            throw new Error(`${result.name} must insert one binding from one input row`)
        }
      }
    },
  )
}
