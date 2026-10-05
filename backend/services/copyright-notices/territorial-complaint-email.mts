import type { TransactionQuery } from '@data-stores/psql/types'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'
import { getTerritorialInformedWindow } from './territorial-informed-at.mts'
import { territorialDecisionIsLiveSql } from './territorial-redress-sql.mts'
import { territorialLabels } from './territorial-labels.mts'

/** Admit a guest notifier's reply to the live EU decision, using email receipt time. */
export async function createGuestTerritorialComplaintFromEmail(
  input: {
    noticeId: string
    submissionId: string
    receivedAt: Date
    sesMessageId: string
    bodyCiphertext: string
  },
  transaction: TransactionQuery,
): Promise<void> {
  const query = sql`/* createGuestTerritorialComplaintFromEmail:parent */
    SELECT decision.id, decision.decided_at, receipt.requester_user_id
    FROM copyright_territorial_decisions decision
    JOIN copyright_territorial_notice_receipts receipt
      ON receipt.copyright_notice_id = decision.copyright_notice_id
      AND receipt.jurisdiction = decision.jurisdiction
    WHERE decision.copyright_notice_id = ${input.noticeId}
      AND decision.jurisdiction = 'eu_dsa' AND `
  query.append(territorialDecisionIsLiveSql())
  query.append(sql` FOR UPDATE OF decision`)
  const { rows } = await transaction<{
    id: string
    decided_at: Date
    requester_user_id: string | null
  }>(query)
  const parent = rows[0]
  assert(parent, 422, 'An EU decision is required before a complaint can be filed')
  assert(parent.requester_user_id === null, 409, 'Signed-in notifiers complain on the case page')
  const { rows: existing } = await transaction(sql`
    /* createGuestTerritorialComplaintFromEmail:existing */
    SELECT id FROM copyright_territorial_redress_requests
    WHERE copyright_territorial_decision_id = ${parent.id} AND submitted_by_id IS NULL
  `)
  assert(!existing[0], 409, 'A guest complaint already exists for this decision')
  const window = await getTerritorialInformedWindow(
    { noticeId: input.noticeId, decidedAt: parent.decided_at, notifier: true },
    transaction,
  )
  assert(
    !window.window_ends_at || input.receivedAt <= window.window_ends_at,
    422,
    'The complaint period for this decision has ended',
  )
  const body = decryptSecret(input.bodyCiphertext, copyrightEmailIntakePurpose(input.sesMessageId))
  assert(body.trim().length > 0 && body.length <= 50_000, 422, 'explanation is required')
  await transaction(sql`/* createGuestTerritorialComplaintFromEmail:request */
    INSERT INTO copyright_territorial_redress_requests (
      copyright_notice_id, jurisdiction, copyright_territorial_decision_id,
      submitted_by_id, filed_by, idempotency_key, explanation_ciphertext, received_at
    ) VALUES (
      ${input.noticeId}, 'eu_dsa', ${parent.id}, NULL, 'notifier', ${input.submissionId},
      ${encryptSecret(body, `${territorialLabels('eu_dsa').redressPurpose}:${input.submissionId}`)},
      ${input.receivedAt}
    )
  `)
}
