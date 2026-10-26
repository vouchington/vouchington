import { afterAll, describe, expect, it } from 'vitest'
import { read, onGracefulShutdown } from '../index.mts'
import { formatTypeViolations } from '../../../test-helpers/data-stores/psql/schema-static-analysis/name-helpers.mts'
import {
  getModerationRssTargetForeignKeys,
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

type SerialViolation = {
  table_name: string
  column_name: string
  column_default: string | null
  identity_generation: string | null
}

describe('PostgreSQL schema static analysis', () => {
  afterAll(async () => {
    await onGracefulShutdown()
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
    const { rows } = await read<SerialViolation>(
      `/* getSerialStyleColumns */
        SELECT table_name, column_name, column_default, identity_generation
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_default LIKE 'nextval(%'
          AND identity_generation IS NULL
        ORDER BY table_name, column_name`,
    )

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
    const { rows } = await read<{ indexdef: string }>(
      `/* getModerationReportPaginationIndex */
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'moderation_reports'
          AND indexname = 'idx_moderation_reports__pending_id'
        LIMIT 1`,
    )

    expect(rows[0]).toBeDefined()
    expect(rows[0].indexdef).toContain('USING btree (id DESC) WHERE (reviewed_at IS NULL)')
  })

  it('indexes OAuth authorization expiry cleanup across every terminal status', async () => {
    const { rows } = await read<{ indexdef: string }>(
      `/* getOAuthAuthorizationExpiryIndex */
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'oauth_authorizations'
          AND indexname = 'idx_oauth_authorizations__expiry'
        LIMIT 1`,
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
    const { rows } = await read<{ indexdef: string }>(
      `/* getPostLocksIndex */
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'post_locks'
          AND indexname = 'idx_post_locks__post'
        LIMIT 1`,
    )

    expect(rows[0]).toBeDefined()
    expect(rows[0].indexdef).toContain('USING btree (post_id) WHERE (lifted_at IS NULL)')
  })

  it('indexes active user bans by owner and descending pagination id', async () => {
    const { rows } = await read<{ indexdef: string }>(
      `/* getUserCommunityBansPaginationIndex */
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'community_bans'
          AND indexname = 'idx_community_bans__user'
        LIMIT 1`,
    )

    expect(rows[0]).toBeDefined()
    expect(rows[0]!.indexdef).toContain('USING btree (user_id, id DESC) WHERE (lifted_at IS NULL)')
  })

  it('indexes notification community foreign keys on the partitioned parent', async () => {
    const { rows } = await read<{ indexdef: string }>(
      `/* getNotificationCommunityForeignKeyIndex */
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'notifications'
          AND indexname = 'idx_notifications__community_id'
        LIMIT 1`,
    )

    expect(rows[0]).toBeDefined()
    expect(rows[0]!.indexdef).toContain(
      'USING btree (community_id) WHERE (community_id IS NOT NULL)',
    )
  })
})

describe('PostgreSQL schema static-analysis rule helpers', () => {
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
