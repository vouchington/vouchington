import { onGracefulShutdown } from '@data-stores/graceful-shutdown'
import { afterAll, describe, expect, it } from 'vitest'
import { readPublicIndexDefinition } from '../../../test-helpers/data-stores/psql/schema-catalog.mts'
import { formatTypeViolations } from '../../../test-helpers/data-stores/psql/schema-static-analysis/name-helpers.mts'
import {
  getModerationRssTargetForeignKeys,
  getSerialStyleColumns,
  getTypeViolations,
} from '../../../test-helpers/data-stores/psql/schema-static-analysis/queries.mts'
import { getUuidConventionViolations } from '../../../test-helpers/data-stores/psql/schema-static-analysis/uuid-query.mts'
import { getTimestampConventionViolations } from '../../../test-helpers/data-stores/psql/schema-static-analysis/timestamp-query.mts'
import {
  formatTimestampConventionViolation,
  formatUuidConventionViolation,
  isAllowedTimestampConventionViolation,
  isAllowedUuidConventionViolation,
} from '../../../test-helpers/data-stores/psql/schema-static-analysis/conventions.mts'

describe('PostgreSQL schema static analysis', () => {
  afterAll(async () => {
    await onGracefulShutdown('SIGTERM')
  })

  it.each([
    ['operational_tombstone_retention_cursors', 'cursor_record_id'],
    ['rss_feed_item_category_projection_results', 'change_id'],
    ['rss_feed_item_category_snapshot_reconciliations', 'change_id'],
  ])('limits the reviewed %s.%s UUID exception to its exact table', (table, name) => {
    const problem = 'uuid-column-without-key-constraint'
    expect(
      isAllowedUuidConventionViolation({ table_name: table, column_name: name, problem }),
    ).toBe(true)
    expect(
      isAllowedUuidConventionViolation({ table_name: 'new_records', column_name: name, problem }),
    ).toBe(false)
  })

  it('uses jsonb instead of json columns', async () => {
    const violations = await getTypeViolations('json')

    expect(formatTypeViolations(violations)).toEqual([])
  })

  it('uses text instead of varchar columns', async () => {
    const violations = await getTypeViolations('varchar')

    expect(formatTypeViolations(violations)).toEqual([])
  })

  it('uses identity columns instead of serial-style nextval defaults', async () => {
    const rows = await getSerialStyleColumns()

    expect(
      rows.map(
        row => `${row.table_name}.${row.column_name}: default=${row.column_default ?? '<none>'}`,
      ),
    ).toEqual([])
  })

  it('uses UUID columns only for keys or documented exceptions', async () => {
    const violations = await getUuidConventionViolations()

    expect(
      violations.flatMap(violation =>
        !isAllowedUuidConventionViolation(violation)
          ? [formatUuidConventionViolation(violation)]
          : [],
      ),
    ).toEqual([])
  })

  it('uses UUIDv7-derived created_at values and enabled updated_at triggers', async () => {
    const violations = await getTimestampConventionViolations()

    expect(
      violations.flatMap(violation =>
        !isAllowedTimestampConventionViolation(violation)
          ? [formatTimestampConventionViolation(violation)]
          : [],
      ),
    ).toEqual([])
  })

  it('indexes pending moderation report pagination by UUIDv7 id', async () => {
    const rows = await readPublicIndexDefinition(
      'moderation_reports',
      'idx_moderation_reports__pending_id',
    )

    expect(rows[0]).toBeDefined()
    expect(rows[0]!.indexdef).toContain('USING btree (id DESC) WHERE (reviewed_at IS NULL)')
  })

  it('indexes OAuth authorization expiry cleanup across every terminal status', async () => {
    const rows = await readPublicIndexDefinition(
      'oauth_authorizations',
      'idx_oauth_authorizations__expiry',
    )

    expect(rows).toEqual([
      {
        indexdef:
          'CREATE INDEX idx_oauth_authorizations__expiry ON public.oauth_authorizations USING btree (expires_at, id)',
      },
    ])
  })

  it('uses real RSS feed item foreign keys for moderation target columns', async () => {
    const rows = await getModerationRssTargetForeignKeys()

    expect(rows.map(row => `${row.table_name}:${row.delete_rule}`)).toEqual([
      'moderation_cases:CASCADE',
      'moderation_report_judgements:CASCADE',
      'moderation_reports:CASCADE',
      'report_integrity_flags:CASCADE',
    ])
  })

  it('indexes active post locks by post_id', async () => {
    const rows = await readPublicIndexDefinition('post_locks', 'idx_post_locks__post')

    expect(rows[0]).toBeDefined()
    expect(rows[0]!.indexdef).toContain('USING btree (post_id) WHERE (lifted_at IS NULL)')
  })

  it('indexes active user bans by owner and descending pagination id', async () => {
    const rows = await readPublicIndexDefinition('community_bans', 'idx_community_bans__user')

    expect(rows[0]).toBeDefined()
    expect(rows[0]!.indexdef).toContain('USING btree (user_id, id DESC) WHERE (lifted_at IS NULL)')
  })

  it('indexes notification community foreign keys on the partitioned parent', async () => {
    const rows = await readPublicIndexDefinition('notifications', 'idx_notifications__community_id')

    expect(rows[0]).toBeDefined()
    expect(rows[0]!.indexdef).toContain(
      'USING btree (community_id) WHERE (community_id IS NOT NULL)',
    )
  })
})

describe('PostgreSQL schema static-analysis rule helpers', () => {
  it('exempts only the deletion-stable AI usage scan positions', () => {
    for (const column_name of ['cursor_id', 'sweep_upper_bound_id']) {
      expect(
        isAllowedUuidConventionViolation({
          table_name: 'ai_usage_retention_cursors',
          column_name,
          problem: 'uuid-column-without-key-constraint',
        }),
      ).toBe(true)
    }
    expect(
      isAllowedUuidConventionViolation({
        table_name: 'ai_usage_retention_cursors',
        column_name: 'ai_usage_record_id',
        problem: 'uuid-column-without-key-constraint',
      }),
    ).toBe(false)
  })

  it('derives default-less UUIDv7 id exceptions from the schema-growth registry', () => {
    expect(
      isAllowedUuidConventionViolation({
        table_name: 'rss_feed_items',
        column_name: 'id',
        problem: 'uuid-id-without-uuidv7-default',
      }),
    ).toBe(true)
    expect(
      isAllowedUuidConventionViolation({
        table_name: 'rss_feeds',
        column_name: 'id',
        problem: 'uuid-id-without-uuidv7-default',
      }),
    ).toBe(false)
  })
})
