import type { TransactionQuery } from '@data-stores/psql/types'
import { buildPageInfo } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import sql from 'sql-template-strings'
import { decryptCopyrightText } from './erased-ciphertext.mts'
import { getTerritorialInformedWindow } from './territorial-informed-at.mts'
import { territorialLabels } from './territorial-labels.mts'
import type { TerritorialCopyrightJurisdiction } from './territorial-fields.mts'

export type CopyrightTerritorialStaffComplaint = {
  id: string
  filed_by: 'notifier' | 'poster' | 'reviewer'
  submitted_by_user_id: string | null
  received_at: Date
  explanation: string
  informed_at: Date | null
  window_ends_at: Date | null
  decision: {
    id: string
    decided_at: Date
    staff_disposition: 'maintain' | 'revoke'
    rationale: string
  } | null
}

export function territorialComplaintCursorScope(noticeId: string, decisionId: string): string {
  return `copyright-territorial-complaints:${noticeId}:${decisionId}:id-asc`
}

export async function selectTerritorialStaffComplaints(
  noticeId: string,
  decisionId: string | null,
  decidedAt: Date | null,
  jurisdiction: TerritorialCopyrightJurisdiction,
  query: TransactionQuery,
  options: { limit: number; afterId?: string } = { limit: 25 },
): Promise<{ results: CopyrightTerritorialStaffComplaint[]; page_info: PageInfo }> {
  // A decisionless case has no complaints. This is an actual empty collection, not truncation.
  if (!decisionId || !decidedAt)
    return {
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }
  const statement = sql`/* selectTerritorialStaffComplaints */
    SELECT request.id, request.idempotency_key, request.filed_by,
      request.submitted_by_user_id, request.received_at, request.explanation_ciphertext,
      redress_decision.id AS redress_decision_id, redress_decision.decided_at AS redress_decided_at,
      redress_decision.staff_disposition, redress_decision.rationale_ciphertext
    FROM copyright_territorial_redress_requests request
    LEFT JOIN copyright_territorial_redress_decisions redress_decision
      ON redress_decision.copyright_territorial_redress_request_id = request.id
    WHERE request.copyright_territorial_decision_id = ${decisionId}`
  if (options.afterId) statement.append(sql` AND request.id > ${options.afterId}`)
  statement.append(sql` ORDER BY request.id ASC LIMIT ${options.limit + 1}`)
  const { rows: fetched } = await query<{
    id: string
    idempotency_key: string
    filed_by: CopyrightTerritorialStaffComplaint['filed_by']
    submitted_by_user_id: string | null
    received_at: Date
    explanation_ciphertext: string
    redress_decision_id: string | null
    redress_decided_at: Date | null
    staff_disposition: 'maintain' | 'revoke' | null
    rationale_ciphertext: string | null
  }>(statement)
  const rows = fetched.slice(0, options.limit)
  const labels = territorialLabels(jurisdiction)
  const windows = await Promise.all(
    rows.map(row =>
      row.filed_by === 'reviewer'
        ? Promise.resolve({ informed_at: null, window_ends_at: null })
        : getTerritorialInformedWindow(
            {
              noticeId,
              decidedAt,
              notifier: row.filed_by === 'notifier',
              posterUserId:
                row.filed_by === 'poster' ? (row.submitted_by_user_id ?? undefined) : undefined,
            },
            query,
          ),
    ),
  )
  const result: CopyrightTerritorialStaffComplaint[] = []
  for (const [index, row] of rows.entries()) {
    const window = windows[index]!
    result.push({
      id: row.id,
      filed_by: row.filed_by,
      submitted_by_user_id: row.submitted_by_user_id,
      received_at: row.received_at,
      explanation: decryptCopyrightText(
        row.explanation_ciphertext,
        `${labels.redressPurpose}:${row.idempotency_key}`,
      ),
      informed_at: window.informed_at,
      window_ends_at: window.window_ends_at,
      decision:
        row.redress_decision_id &&
        row.redress_decided_at &&
        row.staff_disposition &&
        row.rationale_ciphertext
          ? {
              id: row.redress_decision_id,
              decided_at: row.redress_decided_at,
              staff_disposition: row.staff_disposition,
              rationale: decryptCopyrightText(
                row.rationale_ciphertext,
                `${labels.redressDecisionPurpose}:${row.id}`,
              ),
            }
          : null,
    })
  }
  const scope = territorialComplaintCursorScope(noticeId, decisionId)
  return {
    results: result,
    page_info: buildPageInfo(result, {
      hasNextPage: fetched.length > options.limit,
      getCursor: item => ({ id: item.id, scope }),
    }),
  }
}
