import { afterAll, describe, expect, it } from 'vitest'
import { read, onGracefulShutdown } from '../index.mts'
import {
  formatNamedColumns,
  formatNamedObjects,
  formatTypeViolations,
  isIgnoredForNameInflection,
  isSnakeCase,
  looksPlural,
} from '../test-helpers/schema-static-analysis/name-helpers.mts'
import {
  getCommentViolations,
  getNamedColumns,
  getNamedObjects,
  getTypeViolations,
} from '../test-helpers/schema-static-analysis/queries.mts'
import { getUuidConventionViolations } from '../test-helpers/schema-static-analysis/uuid-query.mts'
import { getTimestampConventionViolations } from '../test-helpers/schema-static-analysis/timestamp-query.mts'
import {
  formatCommentViolation,
  formatTimestampConventionViolation,
  formatUuidConventionViolation,
  isAllowedCommentViolation,
  isAllowedTimestampConventionViolation,
  isAllowedUuidConventionViolation,
} from '../test-helpers/schema-static-analysis/conventions.mts'

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

  it('uses snake_case relation and column names', async () => {
    const [objects, columns] = await Promise.all([
      getNamedObjects({ includeViews: true }),
      getNamedColumns({ includeViews: true }),
    ])

    const invalidObjects = objects.filter(object => !isSnakeCase(object.name))
    const invalidColumns = columns.filter(column => !isSnakeCase(column.column_name))

    expect(formatNamedObjects(invalidObjects)).toEqual([])
    expect(formatNamedColumns(invalidColumns)).toEqual([])
  })

  it('uses plural collection names for tables', async () => {
    const objects = await getNamedObjects({ includeViews: false })
    const invalidObjects = objects.filter(
      object => !isIgnoredForNameInflection(object.name) && !looksPlural(object.name),
    )

    expect(formatNamedObjects(invalidObjects)).toEqual([])
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

  it('documents tables and non-standard columns', async () => {
    const violations = await getCommentViolations()

    expect(
      violations.flatMap(violation =>
        !isAllowedCommentViolation(violation) ? [formatCommentViolation(violation)] : [],
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

  it('uses UUIDv7-derived created_at and explicit updated_at conventions', async () => {
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
          AND indexname = 'idx_moderation_reports_pending_id'
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
    const { rows } = await read<{ table_name: string; delete_rule: string }>(
      `/* getModerationRssTargetForeignKeys */
        SELECT
          tc.table_name,
          rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_schema = tc.constraint_schema
         AND kcu.constraint_name = tc.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_schema = tc.constraint_schema
         AND ccu.constraint_name = tc.constraint_name
        JOIN information_schema.referential_constraints rc
          ON rc.constraint_schema = tc.constraint_schema
         AND rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'rss_feed_item_id'
          AND ccu.table_name = 'rss_feed_items'
          AND tc.table_name = ANY($1)
        ORDER BY tc.table_name`,
      [
        [
          'moderation_cases',
          'moderation_reports',
          'moderation_report_judgements',
          'report_integrity_flags',
        ],
      ],
    )

    expect(rows.map(row => `${row.table_name}:${row.delete_rule}`)).toEqual([
      'moderation_cases:CASCADE',
      'moderation_report_judgements:CASCADE',
      'moderation_reports:CASCADE',
      'report_integrity_flags:CASCADE',
    ])
  })

  it('derives lifecycle status instead of storing redundant status columns', async () => {
    const { rows } = await read<{ table_name: string }>(
      `/* getModerationLifecycleStatusColumns */
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'status'
          AND table_name = ANY($1)
        ORDER BY table_name`,
      [['moderation_reports', 'review_disputes', 'moderation_appeals', 'verified_identities']],
    )

    expect(rows.map(row => row.table_name)).toEqual([])
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
  it('exempts the RSS DEFAULT partition without exempting ordinary singular tables', () => {
    expect(isIgnoredForNameInflection('rss_feed_items_default')).toBe(true)
    expect(isIgnoredForNameInflection('notification_default')).toBe(false)
    expect(isIgnoredForNameInflection('rss_feed_item')).toBe(false)
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

  it('does not treat singular s-ending names as plural collection names', () => {
    expect(looksPlural('import_status')).toBe(false)
    expect(looksPlural('content_series')).toBe(false)
    expect(looksPlural('authorized_people')).toBe(true)
    expect(looksPlural('eligible_children')).toBe(true)
    expect(looksPlural('topics__rewards_program_statuses')).toBe(true)
    expect(looksPlural('analyses')).toBe(true)
  })
})
