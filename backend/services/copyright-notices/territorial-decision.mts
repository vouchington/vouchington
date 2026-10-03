import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { assertBoundedText, type TerritorialCopyrightJurisdiction } from './territorial-fields.mts'
import { territorialLabels } from './territorial-labels.mts'
import { lockCurrentCopyrightJurisdictionPolicy } from './jurisdiction-policy.mts'

export type TerritorialCopyrightDecision = {
  id: string
  decided_at: Date
  automation_disclosure: 'human'
}

/**
 * Records the one staff decision on a received territorial notice. The EU row is the DSA Art. 17
 * statement of reasons and the UK row is the staff review; both live in
 * copyright_territorial_decisions and are told apart by jurisdiction.
 */
export async function recordTerritorialCopyrightDecision(
  actor: PrivateUser,
  jurisdiction: TerritorialCopyrightJurisdiction,
  noticeId: string,
  rationale: string,
): Promise<TerritorialCopyrightDecision> {
  assert(currentUserCanReviewCopyrightNotices(actor), 403, 'Forbidden')
  const labels = territorialLabels(jurisdiction)
  const text = assertBoundedText(rationale, 50_000, labels.decisionTextRequired)
  await using transaction = await beginTransaction()
  const { rows: receipts } = await transaction<{ id: string }>(
    sql`/* recordTerritorialCopyrightDecision:receipt */
    SELECT id FROM copyright_territorial_notice_receipts
    WHERE copyright_notice_id = ${noticeId} AND jurisdiction = ${jurisdiction}
  `,
  )
  assert(receipts[0], 404, labels.noticeNotFound)
  const { rows: existing } = await transaction<{ id: string }>(
    sql`/* recordTerritorialCopyrightDecision:existing */
    SELECT id FROM copyright_territorial_decisions
    WHERE copyright_notice_id = ${noticeId} AND jurisdiction = ${jurisdiction}
  `,
  )
  assert(!existing[0], 409, labels.decisionExists)
  await lockCurrentCopyrightJurisdictionPolicy(jurisdiction, transaction)
  const { rows } = await transaction<TerritorialCopyrightDecision>(
    sql`/* recordTerritorialCopyrightDecision */
    INSERT INTO copyright_territorial_decisions (
      copyright_notice_id, jurisdiction, decided_by_id, automation_disclosure, rationale_ciphertext
    ) VALUES (
      ${noticeId}, ${jurisdiction}, ${actor.id}, 'human',
      ${encryptSecret(text, `${labels.decisionPurpose}:${noticeId}`)}
    )
    RETURNING id, decided_at, automation_disclosure
  `,
  )
  const created = rows[0]
  assert(created, 500, labels.decisionFailed)
  await transaction.commit()
  return created
}
