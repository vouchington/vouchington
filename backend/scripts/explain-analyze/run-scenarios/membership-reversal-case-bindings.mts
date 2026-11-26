import { collectPlanNodes } from '@vouchington/explain-plan'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import {
  recordIneligibleStripePurchaseCaseForCollision,
  type IneligibleStripePurchaseCaseInput,
} from '@services/memberships/ineligible-stripe-purchase-reversal/case-creation'
import type { CreateProviderMembershipSourceOptions } from '@services/memberships/create-types'
import { createProviderMembershipSource } from '@services/memberships/provider-source'
import { registerScenarioContract } from '../plan-expectations.mts'
import { getResults, runAndCapture, seedUser } from '../run-support.mts'

export async function runMembershipReversalBindingScenarios(
  input: IneligibleStripePurchaseCaseInput,
  directLineageId: string,
  family: {
    options: CreateProviderMembershipSourceOptions & { sourceKind: 'family' }
    lineageId: string
    bindingId: string
  },
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
  const bindScenario = 'membership-reversal-bind-provider-lineage'
  registerScenarioContract(bindScenario, {
    allowEmptyResult: true,
    seededRows: { membership_lineage_bindings: 2002 },
    expectations: [{ kind: 'maxProcessedRows', relation: 'membership_lineage_bindings', max: 2 }],
  })
  await runAndCapture(
    bindScenario,
    async () => {
      await using transaction = await beginTransaction()
      const created = await recordIneligibleStripePurchaseCaseForCollision(
        { ...input, sourceIdentity: newSourceIdentity },
        transaction,
      )
      if (!created) throw new Error('Expected a new case using the unbound lineage')
      await transaction.rollback()
    },
    undefined,
    'createMembership: bind provider lineage',
  )
  const plans = getResults().filter(result => result.scenario_id === bindScenario)
  if (plans.length === 0) throw new Error('Expected captured binding insert plans')
  for (const result of plans) {
    const [root, ...children] = collectPlanNodes(result.plan)
    if (root?.['Tuples Inserted'] !== 1 || !children.some(node => node['Actual Rows'] === 1))
      throw new Error(`${result.name} must insert one binding from one input row`)
  }

  const historyPerLineage = 10000
  await write(
    `/* seedReversalBindingHistory */
    INSERT INTO membership_lineage_bindings
      (membership_provider_lineage_id, user_id, source_kind, released_at, release_reason)
    SELECT fixture.lineage_id, NULL, fixture.kind, CURRENT_TIMESTAMP, 'Explain released fixture'
    FROM (VALUES ($1::uuid, 'direct'::membership_source_kinds),
                 ($2::uuid, 'family'::membership_source_kinds)) fixture(lineage_id, kind)
    CROSS JOIN generate_series(1, $3::int)`,
    [directLineageId, family.lineageId, historyPerLineage],
  )
  await write(
    `/* seedReversalOtherFamilyBindings */
    INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id, source_kind)
    SELECT $1::uuid, fixture.user_id, 'family'
    FROM unnest($2::uuid[]) fixture(user_id)`,
    [family.lineageId, [input.userId, seedUser.id]],
  )
  await write('/* analyzeReversalBindingHistory */ ANALYZE membership_lineage_bindings')

  const directScenario = 'membership-reversal-lock-provider-binding'
  const familyScenario = 'membership-reversal-find-family-provider-binding'
  registerBindingLookupContract(directScenario, 'current_direct_lineage', historyPerLineage)
  registerBindingLookupContract(familyScenario, 'current_family_lineage_user', historyPerLineage)

  await runAndCapture(
    directScenario,
    async () => {
      await using transaction = await beginTransaction()
      await recordIneligibleStripePurchaseCaseForCollision(input, transaction)
      await transaction.rollback()
    },
    undefined,
    'createMembership: find provider binding',
  )
  await runAndCapture(
    familyScenario,
    async () => {
      await using transaction = await beginTransaction()
      const found = await createProviderMembershipSource(family.options, transaction)
      if (found.bindingId !== family.bindingId)
        throw new Error('Expected the current binding for the requested family member')
      await transaction.rollback()
    },
    undefined,
    'createMembership: find provider binding',
  )
}

function registerBindingLookupContract(
  scenario: string,
  indexSuffix: 'current_direct_lineage' | 'current_family_lineage_user',
  historyPerLineage: number,
) {
  registerScenarioContract(scenario, {
    seededRows: { membership_lineage_bindings: 2002 + historyPerLineage * 2 + 2 },
    expectations: [
      { kind: 'maxProcessedRows', relation: 'membership_lineage_bindings', max: 2 },
      { kind: 'usesIndexes', indexes: [`idx_membership_lineage_bindings__${indexSuffix}`] },
    ],
  })
}
