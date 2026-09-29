import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { assertBoundedText } from './territorial-fields.mts'
import { lockCurrentCopyrightTerritorialPolicy } from './territorial-policy.mts'

export type UkCopyrightReview = {
  id: string
  reviewed_at: Date
  automation_disclosure: 'human'
}

export async function recordUkCopyrightReview(
  actor: PrivateUser,
  noticeId: string,
  rationale: string,
): Promise<UkCopyrightReview> {
  assert(currentUserCanReviewCopyrightNotices(actor), 403, 'Forbidden')
  const text = assertBoundedText(rationale, 50_000, 'rationale is required')
  await using transaction = await beginTransaction()
  const { rows: receipts } = await transaction<{ id: string }>(
    sql`/* recordUkCopyrightReview:receipt */
    SELECT id FROM copyright_uk_notice_receipts WHERE copyright_notice_id = ${noticeId}
  `,
  )
  assert(receipts[0], 404, 'UK copyright notice not found')
  const { rows: existing } = await transaction<{ id: string }>(
    sql`/* recordUkCopyrightReview:existing */
    SELECT id FROM copyright_uk_reviews WHERE copyright_notice_id = ${noticeId}
  `,
  )
  assert(!existing[0], 409, 'A UK copyright review already exists')
  await lockCurrentCopyrightTerritorialPolicy('uk', transaction)
  const { rows } = await transaction<UkCopyrightReview>(
    sql`/* recordUkCopyrightReview */
    INSERT INTO copyright_uk_reviews (
      copyright_notice_id, reviewed_by_id, automation_disclosure, rationale_ciphertext
    ) VALUES (
      ${noticeId}, ${actor.id}, 'human',
      ${encryptSecret(text, `copyright-uk-review:${noticeId}`)}
    )
    RETURNING id, reviewed_at, automation_disclosure
  `,
  )
  const created = rows[0]
  assert(created, 500, 'Failed to record UK copyright review')
  await transaction.commit()
  return created
}
