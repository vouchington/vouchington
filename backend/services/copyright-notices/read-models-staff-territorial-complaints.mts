import type { TransactionQuery } from '@data-stores/psql/types'
import { buildPageInfo } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import sql from 'sql-template-strings'
import { decryptCopyrightText } from './erased-ciphertext.mts'
import {
  complaintWindowRequests,
  getTerritorialInformedWindows,
} from './territorial-informed-at.mts'
import { territorialLabels } from './territorial-labels.mts'
import type { TerritorialCopyrightJurisdiction } from './territorial-fields.mts'

export type CopyrightTerritorialStaffComplaint = {
  id: string
  filed_by: 'notifier' | 'poster' | 'reviewer'
  submitted_by_id: string | null
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

type ComplaintPage = { results: CopyrightTerritorialStaffComplaint[]; page_info: PageInfo }
type ComplaintCase = {
  noticeId: string
  decisionId: string | null
  decidedAt: Date | null
  jurisdiction: TerritorialCopyrightJurisdiction
}
type ComplaintRow = {
  decision_id: string
  id: string
  idempotency_key: string
  filed_by: CopyrightTerritorialStaffComplaint['filed_by']
  submitted_by_id: string | null
  received_at: Date
  explanation_ciphertext: string
  redress_decision_id: string | null
  redress_decided_at: Date | null
  staff_disposition: 'maintain' | 'revoke' | null
  rationale_ciphertext: string | null
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
          redress_decision.id AS redress_decision_id, redress_decision.decided_at AS redress_decided_at,
          redress_decision.staff_disposition, redress_decision.rationale_ciphertext
        FROM copyright_territorial_redress_requests request
        LEFT JOIN copyright_territorial_redress_decisions redress_decision
          ON redress_decision.copyright_territorial_redress_request_id = request.id
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
    listed.map(({ item, decided, fetched }): [string, ComplaintPage] => {
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
        toComplaintPage(decided, { fetched, limit: options.limit, windows: caseWindows }),
      ]
    }),
  )
}

function toComplaintPage(
  { noticeId, decisionId, jurisdiction }: ComplaintCase & { decisionId: string },
  input: {
    fetched: ComplaintRow[]
    limit: number
    windows: Awaited<ReturnType<typeof getTerritorialInformedWindows>>
  },
): ComplaintPage {
  const rows = input.fetched.slice(0, input.limit)
  const labels = territorialLabels(jurisdiction)
  const result: CopyrightTerritorialStaffComplaint[] = []
  for (const [index, row] of rows.entries()) {
    const window = input.windows[index]!
    result.push({
      id: row.id,
      filed_by: row.filed_by,
      submitted_by_id: row.submitted_by_id,
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
      hasNextPage: input.fetched.length > input.limit,
      getCursor: item => ({ id: item.id, scope }),
    }),
  }
}
