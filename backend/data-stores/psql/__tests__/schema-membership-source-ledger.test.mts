import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { onGracefulShutdown, read, write } from '../index.mts'

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
    const { rows } = await read<{ table_name: string; exists: boolean }>(
      `/* getMembershipLedgerTables */
      SELECT table_name, to_regclass('public.' || table_name) IS NOT NULL AS exists
      FROM unnest($1::text[]) AS table_name
      ORDER BY table_name COLLATE "C"`,
      [expected],
    )

    expect(rows).toEqual(expected.toSorted().map(table_name => ({ table_name, exists: true })))
    const { rows: replaced } = await read<{ exists: boolean }>(`/* getReplacedMembershipSkuTable */
      SELECT to_regclass('public.membership_skus') IS NOT NULL AS exists`)
    expect(replaced).toEqual([{ exists: false }])
  })

  it('enforces kind-aware provider sources and bindings and one open activation period', async () => {
    const { rows } = await read<{ indexname: string; indexdef: string }>(
      `/* getMembershipLedgerPartialIndexes */
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = ANY($1::text[])
      ORDER BY indexname`,
      [
        [
          'idx_membership_grant_activation_periods__open_grant',
          'idx_membership_lineage_bindings__current_direct_lineage',
          'idx_membership_lineage_bindings__current_family_lineage_user',
          'idx_membership_sources__direct_lineage',
          'idx_membership_sources__current_family_lineage_user',
        ],
      ],
    )

    expect(rows).toEqual([
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
    const { rows: guards } = await read<{ enabled: string }>(
      `SELECT tgenabled AS enabled FROM pg_trigger WHERE tgname = 'trigger_membership_provider_lineages_immutable'`,
    )
    expect(guards).toEqual([{ enabled: 'O' }])
  })

  it('retains ended projections while limiting each user to one current projection', async () => {
    const { rows: columns } = await read<{ column_name: string }>(
      `/* getMembershipProjectionLifecycleColumn */
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'memberships'
        AND column_name IN ('projection_ended_at', 'deleted_at')
      ORDER BY column_name`,
    )
    expect(columns).toEqual([{ column_name: 'projection_ended_at' }])

    const { rows: indexes } = await read<{ indexdef: string }>(
      `/* getMembershipCurrentProjectionIndex */
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'memberships'
        AND indexname = 'idx_memberships__effective_user'`,
    )
    expect(indexes).toEqual([
      { indexdef: expect.stringContaining('WHERE (projection_ended_at IS NULL)') },
    ])
  })

  it('persists received provider evidence before it is verified', async () => {
    const suffix = randomUUID()
    const { rows } = await write<{
      id: string
      verified_at: Date | null
      rejected_at: Date | null
    }>(
      sql`/* persistMembershipProviderEvidenceBeforeVerification */
        INSERT INTO membership_provider_evidence_records (
          provider, environment, application_id, evidence_lookup_sha256, encrypted_evidence
        ) VALUES (
          'stripe', 'test', ${`schema-evidence-${suffix}`},
          ${suffix.replaceAll('-', '').padEnd(64, '0')}, '\x01'::bytea
        )
        RETURNING id, verified_at, rejected_at`,
    )

    expect(rows).toEqual([
      expect.objectContaining({ id: expect.any(String), verified_at: null, rejected_at: null }),
    ])
  })

  it('makes provider contexts, observation order, grant activation, and financial snapshots non-bypassable', async () => {
    const { rows } = await read<{
      table_name: string
      constraint_name: string
      definition: string
    }>(
      `/* getMembershipLedgerBehaviorConstraints */
      SELECT conrelid::regclass::text AS table_name, conname AS constraint_name,
        pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = ANY($1::regclass[])
        AND (conname = ANY($2::text[]) OR contype = 'c')
      ORDER BY table_name, constraint_name`,
      [
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

    const { rows: indexes } = await read<{ indexname: string; indexdef: string }>(
      `/* getMembershipLedgerBehaviorIndexes */
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = ANY($1::text[])
      ORDER BY indexname`,
      [
        [
          'idx_membership_provider_observations__lineage_revision',
          'idx_membership_grant_activation_periods__open_user',
          'idx_membership_automatic_refund_receipts__operation_id',
        ],
      ],
    )
    expect(indexes).toEqual([
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
    const { rows } = await read<{ table_name: string; delete_rule: string }>(
      `/* getMembershipLedgerAuditDeleteRules */
      SELECT tc.table_name, rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_schema = tc.constraint_schema AND kcu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_schema = tc.constraint_schema AND rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = ANY($1::text[])
      ORDER BY tc.table_name, kcu.column_name`,
      [
        [
          'membership_lineage_bindings',
          'membership_operations',
          'membership_automatic_refund_receipts',
        ],
      ],
    )
    expect(rows.map(row => row.delete_rule)).not.toContain('CASCADE')
  })

  it('identifies renewal notifications by their immutable provider observation snapshot', async () => {
    const { rows } = await read<{
      foreign_table_name: string
      foreign_column_name: string
    }>(`/* getMembershipRenewalNotificationIdentity */
      SELECT ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      INNER JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_schema = tc.constraint_schema
        AND kcu.constraint_name = tc.constraint_name
      INNER JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_schema = tc.constraint_schema
        AND ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_schema = 'public'
        AND tc.table_name = 'memberships'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'renewal_price_increase_notified_observation_id'`)

    expect(rows).toContainEqual({
      foreign_table_name: 'membership_provider_observations',
      foreign_column_name: 'id',
    })
  })
})
