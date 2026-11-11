import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'
import {
  assertNoInitialIntakeReview,
  assertRecommendationOrFallback,
  assertRecommendationScope,
  type CopyrightEmailCorrespondenceKind,
} from './email-correspondence-guards.mts'
import { recordRejectedCopyrightCorrespondenceReview } from './email-correspondence-review.mts'

export async function rejectCopyrightEmailCorrespondence(input: {
  currentUser: PrivateUser
  intakeId: string
  kind: CopyrightEmailCorrespondenceKind
  targetIds?: string[]
  rationale: string
  recommendationId: string | null
  manualFallbackReason: string | null
}): Promise<{ noticeId: string; isDuplicate: boolean }> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  assert(
    input.rationale.trim().length > 0 && input.rationale.length <= 10_000,
    422,
    'Review rationale is required',
  )
  assertRecommendationOrFallback(input.recommendationId, input.manualFallbackReason)
  await using transaction = await beginTransaction()
  const { rows: notices } = await transaction<{ id: string }>(sql`
    /* rejectCopyrightEmailCorrespondence:notice */
    SELECT notice.id FROM copyright_notice_email_intake_notice_links link
    JOIN copyright_notices notice ON notice.id = link.copyright_notice_id
    WHERE link.copyright_notice_email_intake_id = ${input.intakeId} AND link.link_kind = 'thread'
  `)
  assert(notices[0], 404, 'Matched copyright email correspondence not found')
  const { rows } = await transaction<{
    notice_id: string
    amazon_ses_message_id: string
  }>(sql`/* rejectCopyrightEmailCorrespondence:pending */
    SELECT link.copyright_notice_id AS notice_id, intake.amazon_ses_message_id
    FROM copyright_notice_email_intakes intake
    JOIN copyright_notice_email_intake_notice_links link
      ON link.copyright_notice_email_intake_id = intake.id AND link.link_kind = 'thread'
    WHERE intake.id = ${input.intakeId}
  `)
  const pending = rows[0]
  assert(pending, 404, 'Matched copyright email correspondence not found')
  await assertNoInitialIntakeReview(transaction, input.intakeId)
  await assertRecommendationScope(transaction, input.intakeId, input.recommendationId)
  const { rows: existingRows } = await transaction<{
    action: 'admitted' | 'rejected'
  }>(sql`/* rejectCopyrightEmailCorrespondence:existing */
    SELECT correspondence_action AS action FROM copyright_notice_email_intake_notice_links
    WHERE copyright_notice_email_intake_id = ${input.intakeId}
      AND correspondence_action IN ('admitted', 'rejected')
  `)
  if (existingRows[0]) {
    assert(
      existingRows[0].action === 'rejected',
      409,
      'Copyright email correspondence was already admitted',
    )
    await transaction.commit()
    return { noticeId: pending.notice_id, isDuplicate: true }
  }
  const { rowCount: pendingDecisions } =
    await transaction(sql`/* rejectCopyrightEmailCorrespondence:pendingDecision */
    SELECT id FROM copyright_notice_email_intake_notice_links
    WHERE copyright_notice_email_intake_id = ${input.intakeId}
      AND correspondence_action = 'pending'
    FOR UPDATE`)
  assert(pendingDecisions === 1, 409, 'Copyright email correspondence was already reviewed')
  await transaction(sql`/* rejectCopyrightEmailCorrespondence:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
      copyright_notice_email_intake_id)
    VALUES (${pending.notice_id}, 'email_correspondence_rejected', ${input.currentUser.id}, ${input.intakeId})
  `)
  const rationaleCiphertext = encryptSecret(
    input.rationale,
    copyrightEmailIntakePurpose(pending.amazon_ses_message_id),
  )
  const manualFallbackCiphertext = input.manualFallbackReason
    ? encryptSecret(
        input.manualFallbackReason,
        copyrightEmailIntakePurpose(pending.amazon_ses_message_id),
      )
    : null
  await recordRejectedCopyrightCorrespondenceReview(transaction, {
    input,
    noticeId: pending.notice_id,
    rationaleCiphertext,
    manualFallbackCiphertext,
  })
  await transaction.commit()
  return { noticeId: pending.notice_id, isDuplicate: false }
}
