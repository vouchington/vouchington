import { write } from '@data-stores/psql'
import { seedUuid } from './common.mts'
import {
  REPORT_CONTEXT_HOSTNAME_COUNT,
  REPORT_CONTEXT_NOISE_POST_COUNT,
  REPORT_CONTEXT_NOISE_REPORTS_PER_POST,
  REPORT_CONTEXT_POST_COUNT,
  REPORT_CONTEXT_REPORTED_USER_COUNT,
  REPORT_CONTEXT_REPORTS_PER_ENTITY,
  REPORT_CONTEXT_RSS_FEED_ITEM_COUNT,
} from './moderation-report-context-counts.mts'

const POST_INDEXES = Array.from({ length: REPORT_CONTEXT_POST_COUNT }, (_, i) => 20 + i)
const REPORTED_USER_INDEXES = Array.from(
  { length: REPORT_CONTEXT_REPORTED_USER_COUNT },
  (_, i) => 50 + i,
)
const HOSTNAME_INDEXES = Array.from({ length: REPORT_CONTEXT_HOSTNAME_COUNT }, (_, i) => 10 + i)
const REPORTER_INDEX_OFFSET = 1000
const NOISE_POST_INDEX_START = 100
const NOISE_REPORTER_INDEX_OFFSET = 2000

export type ReportContextEntity = {
  entityType: 'post' | 'user' | 'url_hostname' | 'rss_feed_item'
  entityId: string
}

/** Pending reports on entities of all four kinds, one open case per entity. */
export async function seedModerationReportContexts(): Promise<void> {
  const reporterIds = Array.from({ length: REPORT_CONTEXT_REPORTS_PER_ENTITY }, (_, i) =>
    seedUuid(REPORTER_INDEX_OFFSET + i, '01'),
  )
  await write(
    `/* seedExplainData */
    WITH targets AS (
      SELECT id AS post_id, NULL::uuid AS reported_user_id, NULL::uuid AS hostname_id,
        NULL::uuid AS rss_feed_item_id
      FROM posts WHERE id = ANY($1::uuid[])
      UNION ALL
      SELECT NULL, id, NULL, NULL FROM users WHERE id = ANY($2::uuid[])
      UNION ALL
      SELECT NULL, NULL, id, NULL FROM url_hostnames WHERE id = ANY($3::uuid[])
      UNION ALL
      SELECT NULL, NULL, NULL, id
      FROM (
        SELECT ids.id FROM rss_feed_item_guids ids
        WHERE ids.guid LIKE 'seed-item-guid-%'
        ORDER BY ids.id LIMIT ${REPORT_CONTEXT_RSS_FEED_ITEM_COUNT}
      ) items
    ),
    inserted_cases AS (
      INSERT INTO moderation_cases (post_id, reported_user_id, hostname_id, rss_feed_item_id)
      SELECT post_id, reported_user_id, hostname_id, rss_feed_item_id FROM targets
      ON CONFLICT DO NOTHING
      RETURNING id, post_id, reported_user_id, hostname_id, rss_feed_item_id
    )
    INSERT INTO moderation_reports (
      created_via, reporter_user_id, post_id, reported_user_id, hostname_id, rss_feed_item_id,
      case_id, reason, original_reason
    )
    SELECT 'api', reporter.id, c.post_id, c.reported_user_id, c.hostname_id, c.rss_feed_item_id,
      c.id, 'spam', 'spam'
    FROM inserted_cases c
    CROSS JOIN unnest($4::uuid[]) AS reporter(id)
    ON CONFLICT DO NOTHING`,
    [
      POST_INDEXES.map(index => seedUuid(index, '05')),
      REPORTED_USER_INDEXES.map(index => seedUuid(index, '01')),
      HOSTNAME_INDEXES.map(index => seedUuid(index, '02')),
      reporterIds,
    ],
  )
  await write(
    `/* seedExplainData */
    WITH inserted_cases AS (
      INSERT INTO moderation_cases (post_id)
      SELECT id FROM posts WHERE id = ANY($1::uuid[])
      ON CONFLICT DO NOTHING
      RETURNING id, post_id
    )
    INSERT INTO moderation_reports (
      created_via, reporter_user_id, post_id, case_id, reason, original_reason
    )
    SELECT 'api', reporter.id, c.post_id, c.id, 'spam', 'spam'
    FROM inserted_cases c
    CROSS JOIN unnest($2::uuid[]) AS reporter(id)
    ON CONFLICT DO NOTHING`,
    [
      Array.from({ length: REPORT_CONTEXT_NOISE_POST_COUNT }, (_, i) =>
        seedUuid(NOISE_POST_INDEX_START + i, '05'),
      ),
      Array.from({ length: REPORT_CONTEXT_NOISE_REPORTS_PER_POST }, (_, i) =>
        seedUuid(NOISE_REPORTER_INDEX_OFFSET + i, '01'),
      ),
    ],
  )
}

/** The seeded entities, derived from their cases so the run process need not repeat the seed picks. */
export async function loadReportContextEntities(): Promise<ReportContextEntity[]> {
  const { rows } = await write<{
    post_id: string | null
    reported_user_id: string | null
    hostname_id: string | null
    rss_feed_item_id: string | null
  }>(
    `/* seedExplainData */
    SELECT post_id, reported_user_id, hostname_id, rss_feed_item_id
    FROM moderation_cases c
    WHERE EXISTS (
      SELECT 1 FROM moderation_reports r WHERE r.case_id = c.id AND r.reporter_user_id = $1
    )
    ORDER BY id`,
    [seedUuid(REPORTER_INDEX_OFFSET, '01')],
  )
  return rows.map(row => {
    if (row.post_id) return { entityType: 'post', entityId: row.post_id }
    if (row.reported_user_id) return { entityType: 'user', entityId: row.reported_user_id }
    if (row.hostname_id) return { entityType: 'url_hostname', entityId: row.hostname_id }
    return { entityType: 'rss_feed_item', entityId: row.rss_feed_item_id! }
  })
}
