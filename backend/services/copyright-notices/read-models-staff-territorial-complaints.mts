import type { CopyrightSecretBatch } from './encryption-key-batch.mts'
import {
  toComplaintPage,
  type ComplaintPage,
  type ComplaintCase,
  type ComplaintRow,
} from './read-models-staff-complaint-page.mts'
export {
  territorialComplaintCursorScope,
  type CopyrightTerritorialStaffComplaint,
} from './read-models-staff-complaint-page.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  complaintWindowRequests,
  getTerritorialInformedWindows,
} from './territorial-informed-at.mts'
import type { TerritorialCopyrightJurisdiction } from './territorial-fields.mts'

export async function selectTerritorialStaffComplaints(
  noticeId: string,
  decisionId: string | null,
  decidedAt: Date | null,
  jurisdiction: TerritorialCopyrightJurisdiction,
  query: TransactionQuery,
  options: { limit: number; afterId?: string } = { limit: 25 },
): Promise<ComplaintPage> {
  const pages = await selectTerritorialStaffComplaintPages(
    [{ noticeId, decisionId, decidedAt, jurisdiction }],
    query,
    options,
  )
  return pages.get(noticeId)!
}

/** One page of complaints per listed case, read in a single statement; each case gets an entry. */
export async function selectTerritorialStaffComplaintPages(
  cases: readonly ComplaintCase[],
  query: TransactionQuery,
  options: { limit: number; afterId?: string } = { limit: 25 },
  ownerScopes?: CopyrightSecretBatch,
): Promise<Map<string, ComplaintPage>> {
  const decided = cases.filter(item => item.decisionId && item.decidedAt)
  const rowsByDecision = new Map<string, ComplaintRow[]>()
  if (decided.length > 0) {
    const statement = sql`/* selectTerritorialStaffComplaints */
      SELECT request.*
      FROM unnest(${decided.map(item => item.decisionId)}::uuid[]) AS listed(decision_id)
      CROSS JOIN LATERAL (
        SELECT request.copyright_territorial_decision_id AS decision_id, request.id,
          request.idempotency_key, request.filed_by,
          request.submitted_by_id, request.received_at, request.explanation_ciphertext,
          request.current_staff_decision_identity_id AS redress_decision_id,
          request.decided_at AS redress_decided_at,
          request.staff_disposition, request.rationale_ciphertext
        FROM copyright_territorial_redress_requests request
        WHERE request.copyright_territorial_decision_id = listed.decision_id`
    if (options.afterId) statement.append(sql` AND request.id > ${options.afterId}`)
    statement.append(sql`
        ORDER BY request.id ASC LIMIT ${options.limit + 1}
      ) request
      ORDER BY request.id ASC
    `)
    const { rows } = await query<ComplaintRow>(statement)
    for (const row of rows) {
      const group = rowsByDecision.get(row.decision_id)
      if (group) group.push(row)
      else rowsByDecision.set(row.decision_id, [row])
    }
  }
  const listed = cases.map(item => ({
    item,
    decided:
      item.decisionId && item.decidedAt
        ? { ...item, decisionId: item.decisionId, decidedAt: item.decidedAt }
        : null,
    fetched: (item.decisionId && rowsByDecision.get(item.decisionId)) || [],
  }))
  const windowRequests = listed.flatMap(({ decided, fetched }) =>
    decided
      ? fetched.slice(0, options.limit).flatMap(row => complaintWindowRequests(decided, row))
      : [],
  )
  const windows = (await getTerritorialInformedWindows(windowRequests, query)).values()
  return new Map(
    await Promise.all(
      listed.map(async ({ item, decided, fetched }): Promise<[string, ComplaintPage]> => {
        // A decisionless case has no complaints. This is an actual empty collection, not truncation.
        if (!decided)
          return [
            item.noticeId,
            {
              results: [],
              page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
            },
          ]
        const caseWindows = fetched
          .slice(0, options.limit)
          .map(row =>
            row.filed_by === 'reviewer'
              ? { informed_at: null, window_ends_at: null }
              : windows.next().value!,
          )
        return [
          item.noticeId,
          await toComplaintPage(
            decided,
            { fetched, limit: options.limit, windows: caseWindows },
            query,
            ownerScopes,
          ),
        ]
      }),
    ),
  )
}
