import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import {
  getMembershipCurrentProjectionIndexes,
  getMembershipLedgerAuditDeleteRules,
  getMembershipLedgerBehaviorConstraints,
  getMembershipLedgerBehaviorIndexes,
  getMembershipLedgerPartialIndexes,
  getMembershipLedgerTables,
  getMembershipLineageImmutableTrigger,
  getMembershipProjectionLifecycleColumns,
  getMembershipRenewalNotificationIdentity,
  getReplacedMembershipSkuTableState,
  persistUnverifiedMembershipProviderEvidence,
} from '../../../test-helpers/data-stores/psql/membership-source-ledger.mts'
import { onGracefulShutdown } from '../index.mts'

describe('membership source-ledger schema', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('owns the provider-neutral source ledger without the replaced SKU table', async () => {
    const expected = [
      'membership_products',
      'membership_provider_products',
      'membership_provider_lineages',
      'membership_lineage_bindings',
      'membership_provider_evidence_records',
      'membership_provider_observations',
      'membership_sources',
      'membership_source_states',
      'membership_grants',
      'membership_grant_activation_periods',
      'membership_operations',
      'membership_automatic_refund_receipts',
    ]
    expect(await getMembershipLedgerTables(expected)).toEqual(
      expected.toSorted().map(table_name => ({ table_name, exists: true })),
    )
    expect(await getReplacedMembershipSkuTableState()).toEqual([{ exists: false }])
  })

  it('enforces kind-aware provider sources and bindings and one open activation period', async () => {
    expect(
      await getMembershipLedgerPartialIndexes([
        'idx_membership_grant_activation_periods__open_grant',
        'idx_membership_lineage_bindings__current_direct_lineage',
        'idx_membership_lineage_bindings__current_family_lineage_user',
        'idx_membership_sources__direct_lineage',
        'idx_membership_sources__current_family_lineage_user',
      ]),
    ).toEqual([
      {
        indexname: 'idx_membership_grant_activation_periods__open_grant',
        indexdef: expect.stringContaining('WHERE (ended_at IS NULL)'),
      },
      {
        indexname: 'idx_membership_lineage_bindings__current_direct_lineage',
        indexdef: expect.stringContaining(
          "WHERE ((released_at IS NULL) AND (source_kind = 'direct'::membership_source_kinds))",
        ),
      },
      {
        indexname: 'idx_membership_lineage_bindings__current_family_lineage_user',
        indexdef: expect.stringContaining(
          "WHERE ((released_at IS NULL) AND (source_kind = 'family'::membership_source_kinds))",
        ),
      },
      {
        indexname: 'idx_membership_sources__current_family_lineage_user',
        indexdef: expect.stringContaining(
          "WHERE ((membership_provider_lineage_id IS NOT NULL) AND (user_id IS NOT NULL) AND (source_kind = 'family'::membership_source_kinds))",
        ),
      },
      {
        indexname: 'idx_membership_sources__direct_lineage',
        indexdef: expect.stringContaining(
          "WHERE ((membership_provider_lineage_id IS NOT NULL) AND (source_kind = 'direct'::membership_source_kinds))",
        ),
      },
    ])
    expect(await getMembershipLineageImmutableTrigger()).toEqual([{ enabled: 'O' }])
  })

  it('retains ended projections while limiting each user to one current projection', async () => {
    expect(await getMembershipProjectionLifecycleColumns()).toEqual([
      { column_name: 'projection_ended_at' },
    ])
    expect(await getMembershipCurrentProjectionIndexes()).toEqual([
      { indexdef: expect.stringContaining('WHERE (projection_ended_at IS NULL)') },
    ])
  })

  it('persists received provider evidence before it is verified', async () => {
    expect(await persistUnverifiedMembershipProviderEvidence(randomUUID())).toEqual([
      expect.objectContaining({ id: expect.any(String), verified_at: null, rejected_at: null }),
    ])
  })

  it('makes provider contexts, observation order, grant activation, and financial snapshots non-bypassable', async () => {
    const rows = await getMembershipLedgerBehaviorConstraints(
      [
        'membership_provider_evidence_records',
        'membership_provider_observations',
        'membership_source_states',
        'membership_grants',
        'membership_grant_activation_periods',
        'memberships',
        'membership_operations',
        'membership_automatic_refund_receipts',
      ],
      [
        'fk_membership_provider_evidence_records__lineage_context',
        'fk_membership_provider_observations__evidence_context',
        'fk_membership_provider_observations__lineage_context',
        'fk_membership_provider_observations__product_context',
        'fk_membership_provider_observations__renewal_product_context',
        'fk_membership_source_states__source_lineage',
        'fk_membership_source_states__source_kind',
        'fk_membership_source_states__observation_lineage_product_kind',
        'fk_membership_grants__admin_source',
        'fk_membership_grants__source_user',
        'fk_membership_grant_activation_periods__grant_user',
        'fk_memberships__source_user',
        'fk_memberships__renewal_observation_snapshot',
        'fk_membership_automatic_refund_receipts__operation_snapshot',
        'membership_operations_check',
        'membership_automatic_refund_receipts_check',
      ],
    )
    const definitions = rows.map(row => `${row.table_name}:${row.definition}`).join('\n')
    expect(definitions).toContain('provider, environment, application_id')
    expect(definitions).toContain(
      'remaining_refundable_minor_units <= qualifying_allocation_minor_units',
    )
    expect(definitions).toContain('amount_minor_units = 0')
    expect(definitions).toContain('amount_minor_units <= remaining_refundable_minor_units')
    expect(definitions).toContain("source_kind <> 'admin_grant'")
    expect(definitions).toMatch(/membership_provider_observation_id IS NULL\)? OR/)
    expect(definitions).toContain("source_kind = 'admin_grant'")
    expect(definitions).toContain('membership_provider_lineage_id')
    expect(definitions).toContain('membership_grant_id, user_id')
    expect(definitions).not.toContain(
      'memberships:FOREIGN KEY (membership_source_id, membership_product_id)',
    )
    expect(
      await getMembershipLedgerBehaviorIndexes([
        'idx_membership_provider_observations__lineage_revision',
        'idx_membership_grant_activation_periods__open_user',
        'idx_membership_automatic_refund_receipts__operation_id',
      ]),
    ).toEqual([
      expect.objectContaining({
        indexname: 'idx_membership_automatic_refund_receipts__operation_id',
      }),
      expect.objectContaining({
        indexname: 'idx_membership_grant_activation_periods__open_user',
        indexdef: expect.stringContaining('ended_at IS NULL'),
      }),
      expect.objectContaining({
        indexname: 'idx_membership_provider_observations__lineage_revision',
      }),
    ])
  })

  it('keeps audit facts when their live ownership rows are removed', async () => {
    const rows = await getMembershipLedgerAuditDeleteRules([
      'membership_lineage_bindings',
      'membership_operations',
      'membership_automatic_refund_receipts',
    ])
    expect(rows.map(row => row.delete_rule)).not.toContain('CASCADE')
  })

  it('identifies renewal notifications by their immutable provider observation snapshot', async () => {
    expect(await getMembershipRenewalNotificationIdentity()).toContainEqual({
      foreign_table_name: 'membership_provider_observations',
      foreign_column_name: 'id',
    })
  })
})
