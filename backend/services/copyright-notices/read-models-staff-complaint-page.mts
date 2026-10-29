import type { CopyrightSecretBatch } from './encryption-key-batch.mts'
import { openCopyrightSecretsForCiphertexts } from './encryption-keys.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import { buildPageInfo } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import { decryptCopyrightText } from './erased-ciphertext.mts'
import type { getTerritorialInformedWindows } from './territorial-informed-at.mts'
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

export type ComplaintPage = { results: CopyrightTerritorialStaffComplaint[]; page_info: PageInfo }
export type ComplaintCase = {
  noticeId: string
  decisionId: string | null
  decidedAt: Date | null
  jurisdiction: TerritorialCopyrightJurisdiction
}
export type ComplaintRow = {
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

export async function toComplaintPage(
  { noticeId, decisionId, jurisdiction }: ComplaintCase & { decisionId: string },
  input: {
    fetched: ComplaintRow[]
    limit: number
    windows: Awaited<ReturnType<typeof getTerritorialInformedWindows>>
  },
  query: TransactionQuery,
  ownerScopes?: CopyrightSecretBatch,
): Promise<ComplaintPage> {
  const rows = input.fetched.slice(0, input.limit)
  ownerScopes?.assertTransaction(query)
  const owner = { kind: 'notice' as const, id: noticeId }
  const ciphertexts = rows.flatMap(row => [row.explanation_ciphertext, row.rationale_ciphertext])
  await using ownedSecrets = ownerScopes
    ? null
    : await openCopyrightSecretsForCiphertexts(owner, ciphertexts, query)
  const secrets = ownerScopes ? ownerScopes.forCiphertexts(owner, ciphertexts) : ownedSecrets
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
        secrets,
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
                secrets,
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
