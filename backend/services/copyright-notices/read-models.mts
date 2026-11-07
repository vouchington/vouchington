import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { copyrightPlacementPublicVisibleSql } from '@services/media-delivery-safety/copyright-placement-public-visible-sql'
import type {
  CopyrightPublicNotice,
  CopyrightPublicNoticeDetail,
} from './read-models-notice-types.mts'
import {
  copyrightTimelineEventTypesFor,
  type CopyrightTimelineAudience,
} from './timeline-visibility.mts'
export type { CopyrightPublicNoticeDetail } from './read-models-notice-types.mts'

export type CopyrightAcceptedNoticeCursorRow = CopyrightPublicNotice & {
  cursor_accepted_at: string
}

type CopyrightPublicNoticeRow = Omit<CopyrightPublicNotice, 'claimant'> & {
  claimant_user_id: string | null
  public_claimant_display_name: string | null
}

type CopyrightAcceptedNoticeCursorDatabaseRow = CopyrightPublicNoticeRow & {
  cursor_accepted_at: string
}

export const copyrightAcceptedNoticeCursorScope = 'copyright-notices:accepted-at-desc-id-desc'

export async function listAcceptedCopyrightNotices(options: {
  limit: number
  after?: { timestamp: string; id: string }
}): Promise<{ notices: CopyrightAcceptedNoticeCursorRow[]; hasNextPage: boolean }> {
  await using transaction = await beginTransaction()
  const query = sql`/* listAcceptedCopyrightNotices */
    SELECT notice.id, notice.jurisdiction, notice.received_at, notice.accepted_at,
      notice.provisional_withholding_at, count(target.id)::integer AS target_count,
      claimant.id AS claimant_user_id,
      COALESCE(claimant.display_account->>'name', claimant.username, 'Voucha member')
        AS public_claimant_display_name,
      to_char(
        notice.accepted_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS cursor_accepted_at
    FROM copyright_notices notice
    JOIN copyright_notice_targets target ON target.copyright_notice_id = notice.id
    LEFT JOIN view_users_public claimant ON claimant.id = notice.claimant_user_id
    WHERE notice.accepted_at IS NOT NULL
  `
  if (options.after) {
    query.append(sql`
      AND (notice.accepted_at, notice.id) < (${options.after.timestamp}::timestamptz, ${options.after.id})`)
  }
  query.append(sql`
    GROUP BY notice.id, claimant.id, claimant.display_account, claimant.username
    ORDER BY notice.accepted_at DESC, notice.id DESC
    LIMIT ${options.limit + 1}
  `)
  const { rows } = await transaction<CopyrightAcceptedNoticeCursorDatabaseRow>(query)
  await transaction.commit()
  return {
    notices: rows.slice(0, options.limit).map(toCopyrightAcceptedNoticeCursorRow),
    hasNextPage: rows.length > options.limit,
  }
}

/**
 * The member-visible case. Its timeline is the audience allowlist in `timeline-visibility.mts`;
 * only the participant read model widens it, for staff.
 */
export async function getCopyrightPublicNoticeDetail(
  noticeId: string,
  timelineAudience: CopyrightTimelineAudience = 'member',
): Promise<CopyrightPublicNoticeDetail | null> {
  const timelineEventTypes = copyrightTimelineEventTypesFor(timelineAudience)
  await using transaction = await beginTransaction()
  const { rows: notices } =
    await transaction<CopyrightPublicNoticeRow>(sql`/* getCopyrightPublicNotice */
    SELECT notice.id, notice.jurisdiction, notice.received_at, notice.accepted_at,
      notice.provisional_withholding_at, count(target.id)::integer AS target_count,
      claimant.id AS claimant_user_id,
      COALESCE(claimant.display_account->>'name', claimant.username, 'Voucha member')
        AS public_claimant_display_name
    FROM copyright_notices notice
    JOIN copyright_notice_targets target ON target.copyright_notice_id = notice.id
    LEFT JOIN view_users_public claimant ON claimant.id = notice.claimant_user_id
    WHERE notice.id = ${noticeId} AND notice.accepted_at IS NOT NULL
    GROUP BY notice.id, claimant.id, claimant.display_account, claimant.username
  `)
  const noticeRow = notices[0]
  if (!noticeRow) {
    await transaction.commit()
    return null
  }
  const notice = toCopyrightPublicNotice(noticeRow)
  const targetsSql = sql`/* getCopyrightPublicNotice:targets */
      SELECT target.id, COALESCE(surface.surface_kind::text, 'post-image') AS surface,
        CASE WHEN `
  targetsSql.append(copyrightPlacementPublicVisibleSql())
  targetsSql.append(sql` THEN target.hosted_use_url ELSE NULL END AS hosted_use_url,
        CASE
          WHEN restriction.id IS NULL THEN 'pending'
          WHEN restriction.lifted_at IS NULL THEN 'active'
          ELSE 'lifted'
        END AS restriction_status
      FROM copyright_notice_targets target
      LEFT JOIN image_surface_placements surface ON surface.placement_id = target.placement_id
      LEFT JOIN LATERAL (
        SELECT current_restriction.id, current_restriction.lifted_at
        FROM copyright_restrictions current_restriction
        WHERE current_restriction.copyright_notice_target_id = target.id
        ORDER BY current_restriction.id DESC
        LIMIT 1
      ) restriction ON true
      WHERE target.copyright_notice_id = ${noticeId}
      ORDER BY target.id
    `)
  const [targets, timeline] = await Promise.all([
    transaction<CopyrightPublicNoticeDetail['targets'][number]>(targetsSql),
    transaction<
      CopyrightPublicNoticeDetail['timeline'][number]
    >(sql`/* getCopyrightPublicNotice:timeline */
      SELECT id, change_type AS event_type, created_at
      -- no-mistakes-disable-next-line postgres-required-predicates: the full single-case timeline uses the notice/id index across every retained history partition; a UUID-age cutoff would omit retained case events
      FROM copyright_notice_lifecycle_changes
      WHERE copyright_notice_id = ${noticeId}
        AND (${timelineEventTypes}::text[] IS NULL OR change_type = ANY(${timelineEventTypes}::copyright_notice_lifecycle_change_types[]))
      ORDER BY id
    `),
  ])
  await transaction.commit()
  return { ...notice, targets: targets.rows, timeline: timeline.rows }
}

function toCopyrightAcceptedNoticeCursorRow(
  row: CopyrightAcceptedNoticeCursorDatabaseRow,
): CopyrightAcceptedNoticeCursorRow {
  return { ...toCopyrightPublicNotice(row), cursor_accepted_at: row.cursor_accepted_at }
}

function toCopyrightPublicNotice(row: CopyrightPublicNoticeRow): CopyrightPublicNotice {
  return {
    id: row.id,
    jurisdiction: row.jurisdiction,
    received_at: row.received_at,
    accepted_at: row.accepted_at,
    provisional_withholding_at: row.provisional_withholding_at,
    target_count: row.target_count,
    claimant: row.claimant_user_id
      ? {
          user_id: row.claimant_user_id,
          display_name: row.public_claimant_display_name ?? 'Voucha member',
        }
      : null,
  }
}
