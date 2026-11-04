import { read, type QueryExecutor } from '@data-stores/psql'
import { buildPageInfo, decodeScopedUuidCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { ClaimantMisuseEvent } from './claimant-misuse-ledger.mts'
import { getCopyrightClaimantMisuseWindowSize } from './config.mts'

/** Distinct notices per outcome within one newest-first window, never running totals. */
export type ClaimantMisuseSummary = Record<ClaimantMisuseEvent['outcome'], number> & {
  notice_count: number
  page_info: PageInfo
}

/** A single claimant page uses the same batched implementation as staff case reads. */
export async function readClaimantMisuseSummaryPage(
  claimantUserId: string,
  after?: string,
  query: QueryExecutor = read,
): Promise<ClaimantMisuseSummary> {
  return (await readClaimantMisuseSummaries([claimantUserId], query, after)).get(
    claimantUserId.toLowerCase(),
  )!
}

/** Each claimant gets an independent notice window before any misuse evidence is inspected. */
export async function readClaimantMisuseSummaries(
  claimantUserIds: readonly string[],
  query: QueryExecutor = read,
  after?: string,
): Promise<Map<string, ClaimantMisuseSummary>> {
  const claimantIds = [...new Set(claimantUserIds.map(id => id.toLowerCase()))]
  const summaries = new Map<string, ClaimantMisuseSummary>()
  if (claimantIds.length === 0) return summaries
  assert(!after || claimantIds.length === 1, 400, 'A claimant cursor requires one claimant')
  const limit = await getCopyrightClaimantMisuseWindowSize()
  const afterId = after
    ? decodeScopedUuidCursor(after, cursorScope(claimantIds[0]!), 'Invalid cursor format').id
    : undefined
  const statement = sql`/* readClaimantMisuseSummaries */
    SELECT claimant.id AS claimant_user_id,
      summary.ids[1] AS first_id,
      summary.ids[array_length(summary.ids, 1)] AS last_id,
      summary.has_more, summary.notice_count, summary.notice_withdrawn,
      summary.notice_rejected, summary.restriction_reversed_by_counter_notice,
      summary.restriction_reversed_by_appeal
    FROM unnest(${claimantIds}::uuid[]) AS claimant(id)
    CROSS JOIN LATERAL (
      WITH candidates AS MATERIALIZED (
        SELECT id FROM copyright_notices
        WHERE claimant_user_id = claimant.id
          `
  // Keep the seek on the claimant-prefixed index even for a generic cursor plan.
  if (afterId) statement.append(sql`AND (claimant_user_id, id) < (claimant.id, ${afterId}::uuid)`)
  statement.append(sql`
        ORDER BY id DESC
        LIMIT ${limit + 1}
      ), page AS MATERIALIZED (
        SELECT id FROM candidates ORDER BY id DESC LIMIT ${limit}
      )
      SELECT array_agg(notice.id ORDER BY notice.id DESC) AS ids,
        (SELECT count(*) FROM candidates) > ${limit} AS has_more,
        count(*)::int AS notice_count,
        count(*) FILTER (WHERE COALESCE((
          SELECT true FROM copyright_claimant_misuse_events event
          WHERE event.copyright_notice_id = notice.id AND event.outcome = 'notice_withdrawn'
          LIMIT 1
        ), false))::int AS notice_withdrawn,
        count(*) FILTER (WHERE COALESCE((
          SELECT true FROM copyright_claimant_misuse_events event
          WHERE event.copyright_notice_id = notice.id AND event.outcome = 'notice_rejected'
          LIMIT 1
        ), false))::int AS notice_rejected,
        count(*) FILTER (WHERE COALESCE((
          SELECT true FROM copyright_claimant_misuse_events event
          WHERE event.copyright_notice_id = notice.id
            AND event.outcome = 'restriction_reversed_by_counter_notice'
          LIMIT 1
        ), false))::int AS restriction_reversed_by_counter_notice,
        count(*) FILTER (WHERE COALESCE((
          SELECT true FROM copyright_claimant_misuse_events event
          WHERE event.copyright_notice_id = notice.id
            AND event.outcome = 'restriction_reversed_by_appeal'
          LIMIT 1
        ), false))::int AS restriction_reversed_by_appeal
      FROM page notice
    ) summary
  `)
  const { rows } = await query<{
    claimant_user_id: string
    first_id: string | null
    last_id: string | null
    has_more: boolean
    notice_count: number
    notice_withdrawn: number
    notice_rejected: number
    restriction_reversed_by_counter_notice: number
    restriction_reversed_by_appeal: number
  }>(statement)

  for (const row of rows) {
    const boundaries =
      row.first_id && row.last_id ? [{ id: row.first_id }, { id: row.last_id }] : []
    summaries.set(row.claimant_user_id, {
      notice_withdrawn: row.notice_withdrawn,
      notice_rejected: row.notice_rejected,
      restriction_reversed_by_counter_notice: row.restriction_reversed_by_counter_notice,
      restriction_reversed_by_appeal: row.restriction_reversed_by_appeal,
      notice_count: row.notice_count,
      page_info: buildPageInfo(boundaries, {
        hasNextPage: row.has_more,
        getCursor: notice => ({ id: notice.id, scope: cursorScope(row.claimant_user_id) }),
      }),
    })
  }
  return summaries
}

function cursorScope(claimantUserId: string): string {
  return `copyright-claimant-misuse:${claimantUserId}`
}
