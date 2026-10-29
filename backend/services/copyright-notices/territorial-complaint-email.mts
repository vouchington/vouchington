import type { TransactionQuery } from '@data-stores/psql/types'
import { openCopyrightSecrets } from './encryption-keys.mts'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { getTerritorialInformedWindow } from './territorial-informed-at.mts'
import { territorialLabels } from './territorial-labels.mts'

/** Admit a guest notifier's reply to the live EU decision, using email receipt time. */
export async function createGuestTerritorialComplaintFromEmail(
  input: {
    noticeId: string
    submissionId: string
    receivedAt: Date
    bodyText: string
  },
  transaction: TransactionQuery,
): Promise<void> {
  const { rows } = await transaction<{
    id: string
    decided_at: Date
    outcome: 'restrict' | 'no_action'
    authorizing_assessment_identity_id: string | null
    requester_user_id: string | null
  }>(sql`/* createGuestTerritorialComplaintFromEmail:parent */
    SELECT notice.current_territorial_decision_identity_id AS id,
      notice.territorial_decided_at AS decided_at,
      notice.territorial_decision_outcome AS outcome,
      notice.territorial_authorizing_assessment_identity_id AS authorizing_assessment_identity_id,
      receipt.requester_user_id
    FROM copyright_notices notice
    JOIN copyright_territorial_notice_receipts receipt
      ON receipt.copyright_notice_id = notice.id AND receipt.jurisdiction = notice.jurisdiction
    WHERE notice.id = ${input.noticeId} AND notice.jurisdiction = 'eu_dsa'
      AND notice.current_territorial_decision_identity_id IS NOT NULL
    FOR UPDATE OF notice`)
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
  await using secrets = await openCopyrightSecrets(
    { kind: 'notice', id: input.noticeId },
    transaction,
    'write',
  )
  const { encryptSecret } = secrets
  const body = input.bodyText
  assert(body.trim().length > 0 && body.length <= 50_000, 422, 'explanation is required')
  await transaction(sql`/* createGuestTerritorialComplaintFromEmail:request */
    INSERT INTO copyright_territorial_redress_requests (
      copyright_notice_id, jurisdiction, copyright_territorial_decision_id,
      challenged_decision_outcome, authorizing_assessment_identity_id,
      submitted_by_id, filed_by, idempotency_key, explanation_ciphertext, received_at
    ) VALUES (
      ${input.noticeId}, 'eu_dsa', ${parent.id},
      ${parent.outcome}, ${parent.authorizing_assessment_identity_id},
      NULL, 'notifier', ${input.submissionId},
      ${encryptSecret(body, `${territorialLabels('eu_dsa').redressPurpose}:${input.submissionId}`)},
      ${input.receivedAt}
    )
  `)
}
