import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { TransactionQuery } from '@data-stores/psql/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'

export async function rejectCopyrightEmailIntake(input: {
  currentUser: PrivateUser
  intakeId: string
  recommendationId: string | null
  rationale: string
}): Promise<void> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  assert(input.rationale.trim(), 422, 'Email intake review rationale is required')
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    ses_message_id: string
  }>(sql`/* rejectCopyrightEmailIntake:lock */
    SELECT ses_message_id FROM copyright_notice_email_intakes WHERE id = ${input.intakeId} FOR UPDATE
  `)
  const intake = rows[0]
  assert(intake, 404, 'Copyright email intake not found')
  await assertRecommendationScope(transaction, input.recommendationId, input.intakeId)
  const { rows: decisions } = await transaction<{ accepted: boolean }>(
    sql`/* rejectCopyrightEmailIntake:existing */
      SELECT accepted FROM copyright_notice_email_intake_reviews
      WHERE copyright_notice_email_intake_id = ${input.intakeId}`,
  )
  assert(!decisions[0]?.accepted, 409, 'Copyright email intake was already approved')
  if (!decisions[0]) {
    await transaction(sql`/* rejectCopyrightEmailIntake */
      INSERT INTO copyright_notice_email_intake_reviews (
        copyright_notice_email_intake_id, copyright_notice_email_intake_recommendation_id,
        reviewed_at, reviewed_by_id, accepted, rationale_ciphertext
      ) VALUES (
        ${input.intakeId}, ${input.recommendationId}, CURRENT_TIMESTAMP, ${input.currentUser.id},
        false, ${encryptSecret(input.rationale, copyrightEmailIntakePurpose(intake.ses_message_id))}
      )
    `)
  }
  await transaction.commit()
}

async function assertRecommendationScope(
  transaction: TransactionQuery,
  recommendationId: string | null,
  intakeId: string,
): Promise<void> {
  if (!recommendationId) return
  const { rows } = await transaction<{ id: string }>(
    sql`/* rejectCopyrightEmailIntake:recommendation */
      SELECT id FROM copyright_notice_email_intake_recommendations
      WHERE id = ${recommendationId} AND copyright_notice_email_intake_id = ${intakeId}`,
  )
  assert(rows[0], 422, 'Email recommendation does not belong to this intake')
}
