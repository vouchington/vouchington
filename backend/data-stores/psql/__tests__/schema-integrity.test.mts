import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown, read } from '../index.mts'

type UnvalidatedConstraint = {
  table_name: string
  constraint_name: string
}

type DuplicateIndex = {
  table_name: string
  index_names: string
}

describe('PostgreSQL schema integrity', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('has no unvalidated public constraints', async () => {
    const { rows } = await read<UnvalidatedConstraint>(
      `/* getUnvalidatedPublicConstraints */
        SELECT
          conrelid::regclass::text AS table_name,
          conname AS constraint_name
        FROM pg_constraint constraint_definition
        JOIN pg_namespace namespace
          ON namespace.oid = constraint_definition.connamespace
        WHERE namespace.nspname = 'public'
          AND NOT constraint_definition.convalidated
        ORDER BY table_name, constraint_name`,
    )

    expect(rows.map(row => `${row.table_name}.${row.constraint_name}`)).toEqual([])
  })

  it('has no canonical duplicate indexes', async () => {
    const { rows } = await read<DuplicateIndex>(
      `/* getCanonicalDuplicateIndexes */
        SELECT
          index_definition.indrelid::regclass::text AS table_name,
          string_agg(index_relation.relname::text, ', ' ORDER BY index_relation.relname) AS index_names
        FROM pg_index index_definition
        JOIN pg_class index_relation
          ON index_relation.oid = index_definition.indexrelid
        JOIN pg_namespace namespace
          ON namespace.oid = index_relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND index_definition.indisvalid
          AND index_definition.indisready
        GROUP BY
          index_definition.indrelid, index_relation.relam,
          index_definition.indisunique,
          index_definition.indisprimary,
          index_definition.indisexclusion,
          index_definition.indimmediate,
          index_definition.indnullsnotdistinct,
          index_definition.indnkeyatts,
          index_definition.indnatts,
          index_definition.indkey,
          index_definition.indcollation,
          index_definition.indclass,
          index_definition.indoption,
          pg_get_expr(index_definition.indexprs, index_definition.indrelid),
          pg_get_expr(index_definition.indpred, index_definition.indrelid)
        HAVING COUNT(*) > 1
        ORDER BY table_name, index_names`,
    )

    expect(rows.map(row => `${row.table_name}: ${row.index_names}`)).toEqual([])
  })

  it('keeps removed tables absent and support history unpartitioned', async () => {
    const removedTables = [
      'conversation_message_rag',
      'recently_viewed_landing_pages',
      'topics__bank_accounts',
      'wikipedia_topic_recommendations',
    ]
    const { rows: removed } = await read<{ table_name: string; relation: string | null }>(
      `/* getRemovedPostgresTables */
        SELECT table_name, to_regclass('public.' || table_name)::text AS relation
        FROM unnest($1::text[]) AS table_name
        ORDER BY table_name`,
      [removedTables],
    )
    expect(removed).toEqual(
      removedTables.toSorted().map(table_name => ({ table_name, relation: null })),
    )

    const { rows: supportTables } = await read<{
      table_name: string
      relation_kind: string
      is_partitioned: boolean
    }>(
      `/* getSupportHistoryTableKinds */
        SELECT
          relation.relname AS table_name,
          relation.relkind AS relation_kind,
          EXISTS (
            SELECT 1 FROM pg_partitioned_table
            WHERE partrelid = relation.oid
          ) AS is_partitioned
        FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = ANY($1)
        ORDER BY table_name`,
      [['support_agent_runs', 'support_messages']],
    )
    expect(supportTables).toEqual([
      { table_name: 'support_agent_runs', relation_kind: 'r', is_partitioned: false },
      { table_name: 'support_messages', relation_kind: 'r', is_partitioned: false },
    ])
  })

  it('uses concrete curated-aside foreign keys with intentional deletion rules', async () => {
    const { rows } = await read<{
      column_name: string
      target_table: string
      delete_rule: string
    }>(`/* getCuratedAsideForeignKeys */
      SELECT
        key_column.column_name,
        target.table_name AS target_table,
        reference.delete_rule
      FROM information_schema.table_constraints constraint_definition
      JOIN information_schema.key_column_usage key_column
        ON key_column.constraint_schema = constraint_definition.constraint_schema
       AND key_column.constraint_name = constraint_definition.constraint_name
      JOIN information_schema.constraint_column_usage target
        ON target.constraint_schema = constraint_definition.constraint_schema
       AND target.constraint_name = constraint_definition.constraint_name
      JOIN information_schema.referential_constraints reference
        ON reference.constraint_schema = constraint_definition.constraint_schema
       AND reference.constraint_name = constraint_definition.constraint_name
      WHERE constraint_definition.constraint_schema = 'public'
        AND constraint_definition.table_name = 'curated_aside_items'
        AND constraint_definition.constraint_type = 'FOREIGN KEY'
      ORDER BY key_column.column_name`)

    expect(rows.map(row => `${row.column_name}:${row.target_table}:${row.delete_rule}`)).toEqual([
      'community_id:communities:CASCADE',
      'created_by_id:users:SET NULL',
      'rss_feed_id:rss_feeds:CASCADE',
      'topic_id:topics:CASCADE',
    ])

    const { rows: targetChecks } = await read<{ constraint_definition: string }>(
      `/* getCuratedAsideTargetCheck */
        SELECT pg_get_constraintdef(oid) AS constraint_definition
        FROM pg_constraint
        WHERE conrelid = 'curated_aside_items'::regclass
          AND conname = 'chk_curated_aside_items__one_target'`,
    )
    expect(targetChecks).toHaveLength(1)
    expect(targetChecks[0]!.constraint_definition).toContain(
      'num_nonnulls(topic_id, rss_feed_id, community_id) = 1',
    )
  })

  it('uses SET NULL for moderation resolver foreign keys', async () => {
    const { rows } = await read<{ table_name: string; delete_rule: string }>(
      `/* getModerationResolverForeignKeys */
        SELECT
          tc.table_name,
          rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_schema = tc.constraint_schema
         AND kcu.constraint_name = tc.constraint_name
        JOIN information_schema.referential_constraints rc
          ON rc.constraint_schema = tc.constraint_schema
         AND rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_schema = 'public'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'resolved_by_id'
          AND tc.table_name = ANY($1)
        ORDER BY tc.table_name`,
      [['moderation_reports', 'review_disputes']],
    )

    expect(rows.map(row => `${row.table_name}:${row.delete_rule}`)).toEqual([
      'moderation_reports:SET NULL',
      'review_disputes:SET NULL',
    ])
  })

  it('prevents agent responses from completing and failing simultaneously', async () => {
    const { rows } = await read<{ constraint_definition: string }>(
      `/* getAgentResponseTerminalConstraint */
        SELECT pg_get_constraintdef(oid) AS constraint_definition
        FROM pg_constraint
        WHERE conrelid = 'agent_responses'::regclass
          AND conname = 'chk_agent_responses__one_terminal_state'`,
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]!.constraint_definition).toContain('completed_at IS NULL')
    expect(rows[0]!.constraint_definition).toContain('failed_at IS NULL')
  })

  it('keeps refund intents unique and ties admin receipts to a claimed intent', async () => {
    const { rows } = await read<{
      table_name: string
      constraint_name: string
      constraint_type: string
      definition: string
    }>(`/* getMembershipRefundIntentConstraints */
      SELECT
        conrelid::regclass::text AS table_name,
        conname AS constraint_name,
        contype::text AS constraint_type,
        pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid IN (
        'membership_refund_intents'::regclass,
        'membership_refunds'::regclass
      )
        AND conname IN (
          'membership_refund_intents_stripe_idempotency_key_key',
          'membership_refund_intents_request_fingerprint_length_check',
          'fk_mrefunds__intent_source'
        )
      ORDER BY constraint_name
    `)

    expect(rows).toEqual([
      expect.objectContaining({
        constraint_type: 'f',
        definition: expect.stringContaining('(stripe_idempotency_key, membership_source_id)'),
      }),
      expect.objectContaining({ constraint_type: 'c', definition: expect.stringContaining('64') }),
      expect.objectContaining({ constraint_type: 'u' }),
    ])
    expect(rows[0]!.definition).toContain('ON DELETE RESTRICT')
  })

  it('requires durable identity for admin refunds', async () => {
    const { rows } = await read<{ definition: string }>(`/* getMembershipRefundSourceConstraint */
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'membership_refunds'::regclass
        AND conname = 'membership_refunds_source_identity_check'
    `)

    expect(rows).toHaveLength(1)
    expect(rows[0]!.definition).toContain("source = 'admin'")
    expect(rows[0]!.definition).toContain('issued_by_id IS NOT NULL')
    expect(rows[0]!.definition).toContain('stripe_idempotency_key IS NOT NULL')
    expect(rows[0]!.definition).toContain('admin_request_fingerprint IS NOT NULL')
    expect(rows[0]!.definition).not.toContain('idempotent_admin')
  })
})
