import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { buildPageInfo, decodeScopedUuidCursor } from '@modules/pagination'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { getCopyrightAssociationSearchCandidateRows } from './work-limits.mts'

export type CopyrightNoticeAssociationTarget = {
  id: string
  jurisdiction: 'us_dmca' | 'eu_dsa' | 'uk'
  received_at: string
  claimant_display_name: string | null
  work_description: string
}
type AssociationCandidate = CopyrightNoticeAssociationTarget & { matches: boolean; erased: boolean }

export async function searchCopyrightNoticeAssociationTargets(
  currentUser: PrivateUser,
  query: string,
  after?: string,
  queryOptions: QueryOptions = {},
) {
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Forbidden')
  const q = query.trim()
  assert(q.length >= 2 && q.length <= 200, 422, 'Search must have 2 to 200 characters')
  const scope = `copyright-notice-association:${q.toLowerCase()}`
  const afterId = after ? decodeScopedUuidCursor(after, scope, 'Invalid cursor format').id : null
  const pattern = `%${q.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
  const candidateRows = getCopyrightAssociationSearchCandidateRows()
  const searchSql = sql`
    /* searchCopyrightNoticeAssociationTargets */
    WITH candidates AS MATERIALIZED (
      SELECT notice.id, notice.jurisdiction, notice.received_at,
        notice.claimant_display_name, notice.work_description
      FROM copyright_notices notice
  `
  if (afterId) searchSql.append(sql`WHERE notice.id < ${afterId}::uuid`)
  searchSql.append(sql`
      ORDER BY notice.id DESC
      LIMIT ${candidateRows + 1}
    )
    SELECT candidate.id, candidate.jurisdiction, candidate.received_at,
      candidate.claimant_display_name, candidate.work_description,
      COALESCE((
        SELECT TRUE FROM copyright_notice_retention_erasures erasure
        WHERE erasure.copyright_notice_id = candidate.id
        LIMIT 1
      ), FALSE) AS erased,
      (candidate.claimant_display_name ILIKE ${pattern} ESCAPE '\\'
        OR candidate.work_description ILIKE ${pattern} ESCAPE '\\'
        OR to_char(candidate.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') LIKE ${pattern} ESCAPE '\\') AS matches
    FROM candidates candidate
    ORDER BY candidate.id DESC
  `)
  const { rows } = await read<AssociationCandidate>(searchSql, undefined, queryOptions)
  const candidates = rows.slice(0, candidateRows)
  const visible = candidates.filter(
    row =>
      row.matches &&
      !row.erased &&
      (row.jurisdiction === 'us_dmca' || row.jurisdiction === 'eu_dsa'),
  )
  return {
    copyright_notices: visible.map(({ matches: _matches, erased: _erased, ...notice }) => notice),
    page_info: buildPageInfo(candidates, {
      hasNextPage: rows.length > candidateRows,
      getCursor: row => ({ id: row.id, scope }),
    }),
  }
}
