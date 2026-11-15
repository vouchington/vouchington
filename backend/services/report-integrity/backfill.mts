import { getReportIntegrityWorkLimit } from './work-limits.mts'
import { read } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import { MASS_REPORT_WINDOW_MINUTES } from './config.mts'

export type PendingReportEntity = {
  entityType: string
  entityId: string
}

export type PendingReportEntityPage = {
  entities: PendingReportEntity[]
  /** Last inspected report of a full page, including reviewed or ineligible rows. */
  nextCursor: string | null
}

type ReportRow = { id: string; entity: PendingReportEntity | null }

/**
 * Walks a bounded report-id page, then dispatches its distinct live subjects. The exact
 * integrity detector owns the reporter threshold; discovery never aggregates a window.
 * Reviewed/ineligible reports still advance the cursor, including on empty output pages.
 */
export async function listPendingReportEntityPage(
  now: number,
  afterReportId?: string,
  reportIds?: readonly string[],
): Promise<PendingReportEntityPage> {
  if (!Number.isFinite(now)) throw new Error('now must be a finite number')

  const limit = getReportIntegrityWorkLimit('backfill_batch_size')
  const windowStartId = getMinUUIDv7ForDate(new Date(now - MASS_REPORT_WINDOW_MINUTES * 60 * 1000))
  const query = sql`/* listPendingReportEntityPage */
    SELECT mr.id, CASE
      WHEN mr.reviewed_at IS NOT NULL THEN NULL
      WHEN mr.post_id IS NOT NULL THEN (
        SELECT jsonb_build_object('entityType', CASE WHEN p.post_type = 'comment' THEN 'comment' ELSE 'post' END, 'entityId', p.id)
        FROM posts p WHERE p.id = mr.post_id AND p.deleted_at IS NULL
      )
      WHEN mr.reported_user_id IS NOT NULL THEN (
        SELECT jsonb_build_object('entityType', 'user', 'entityId', u.id)
        FROM users u WHERE u.id = mr.reported_user_id AND u.deleted_at IS NULL
      )
      WHEN mr.hostname_id IS NOT NULL THEN (
        SELECT jsonb_build_object('entityType', 'url_hostname', 'entityId', uh.id)
        FROM url_hostnames uh WHERE uh.id = mr.hostname_id AND NOT uh.is_blocked
      )
      WHEN mr.rss_feed_item_id IS NOT NULL THEN (
        SELECT jsonb_build_object('entityType', 'rss_feed_item', 'entityId', rfi.id)
        FROM rss_feed_items rfi WHERE rfi.id = mr.rss_feed_item_id AND rfi.deleted_at IS NULL
      )
    END AS entity
    FROM moderation_reports mr
    WHERE mr.id >= ${windowStartId}::uuid
      AND mr.id > ${afterReportId ?? '00000000-0000-0000-0000-000000000000'}::uuid`
  if (reportIds) query.append(sql` AND mr.id = ANY(${reportIds}::uuid[])`)
  query.append(sql` ORDER BY mr.id LIMIT ${limit}`)
  const { rows } = await read<ReportRow>(query)
  const entities = new Map<string, PendingReportEntity>()
  for (const row of rows) {
    const entity = row.entity
    if (entity) entities.set(`${entity.entityType}:${entity.entityId}`, entity)
  }
  return {
    entities: [...entities.values()],
    nextCursor: rows.length === limit ? rows.at(-1)!.id : null,
  }
}
