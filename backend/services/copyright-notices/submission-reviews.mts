/* oxlint-disable max-lines -- Appeal and counter-notice reviews share one atomic moderator boundary. */
import { beginTransaction } from '@data-stores/psql'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { calculateUsCounterNoticeRestorationWindow } from './deadlines.mts'
import { createCounterNoticeForwardingInTransaction } from './counter-notice-forwarding.mts'
import { createCopyrightDeliveryIntent } from './delivery-intents.mts'
import { createDeterministicCopyrightCorrespondenceInTransaction } from './correspondence.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'
import type { CopyrightHumanReviewAction } from './types.mts'

type AppealDecision = { restrictionId: string; action: CopyrightHumanReviewAction }

export async function reviewCopyrightAppeal(input: {
  submissionId: string
  currentUser: PrivateUser
  recommendationId: string | null
  manualFallbackReason: string | null
  rationale: string
  decisions: AppealDecision[]
}): Promise<{ noticeId: string; reviewIds: string[] }> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  assertBoundedRationale(input.rationale)
  assert(
    (input.recommendationId === null) !== (input.manualFallbackReason === null),
    422,
    'Provide either recommendation_id or manual_fallback_reason',
  )
  if (input.manualFallbackReason !== null) assertBoundedRationale(input.manualFallbackReason)
  assert(input.decisions.length > 0 && input.decisions.length <= 20, 422, 'decisions are required')
  assert(
    new Set(input.decisions.map(decision => decision.restrictionId)).size ===
      input.decisions.length,
    422,
    'Restriction decisions must be unique',
  )

  await using transaction = await beginTransaction()
  await transaction(sql`/* reviewCopyrightAppeal:lock */
    SELECT pg_advisory_xact_lock(hashtextextended(${`copyright-appeal-review:${input.submissionId}`}, 0))
  `)
  const { rows: appealRows } = await transaction<{
    copyright_notice_id: string
    submitted_by_user_id: string | null
    target_ids: string[]
  }>(sql`/* reviewCopyrightAppeal:appeal */
    SELECT submission.copyright_notice_id, submission.submitted_by_user_id,
      ARRAY(
        SELECT submission_target.copyright_notice_target_id
        FROM copyright_notice_submission_targets submission_target
        WHERE submission_target.copyright_notice_submission_id = submission.id
        ORDER BY submission_target.copyright_notice_target_id
      ) AS target_ids
    FROM copyright_notice_submissions submission
    WHERE submission.id = ${input.submissionId} AND submission.kind = 'appeal'
    FOR UPDATE OF submission
  `)
  const appeal = appealRows[0]
  assert(appeal, 404, 'Copyright appeal not found')
  if (input.recommendationId) {
    const { rows } = await transaction(sql`/* reviewCopyrightAppeal:recommendation */
      SELECT id FROM copyright_notice_appeal_recommendations
      WHERE id = ${input.recommendationId}
        AND copyright_notice_submission_id = ${input.submissionId}
    `)
    assert(rows[0], 422, 'Appeal recommendation does not belong to this appeal')
  }
  const { rows: restrictionRows } = await transaction<{
    id: string
    human_reviewed_at: Date | null
    lifted_at: Date | null
  }>(sql`/* reviewCopyrightAppeal:restrictions */
    SELECT restriction.id, restriction.human_reviewed_at, restriction.lifted_at
    FROM copyright_restrictions restriction
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE restriction.id = ANY(${input.decisions.map(decision => decision.restrictionId)})
      AND target.copyright_notice_id = ${appeal.copyright_notice_id}
      AND target.id = ANY(${appeal.target_ids})
    FOR UPDATE OF restriction
  `)
  assert(
    restrictionRows.length === input.decisions.length,
    422,
    'Appeal decisions must cover only restrictions in the appeal',
  )
  const { rows: existingRows } = await transaction<{
    id: string
    copyright_restriction_id: string
    action: CopyrightHumanReviewAction
    copyright_notice_appeal_recommendation_id: string | null
  }>(sql`/* reviewCopyrightAppeal:existing */
    SELECT id, copyright_restriction_id, action, copyright_notice_appeal_recommendation_id
    FROM copyright_notice_appeal_reviews
    WHERE copyright_notice_submission_id = ${input.submissionId}
    FOR UPDATE
  `)
  if (existingRows.length > 0) {
    const expected = new Map(
      input.decisions.map(decision => [decision.restrictionId, decision.action]),
    )
    assert(
      existingRows.length === input.decisions.length &&
        existingRows.every(
          row =>
            expected.get(row.copyright_restriction_id) === row.action &&
            row.copyright_notice_appeal_recommendation_id === input.recommendationId,
        ),
      409,
      'Copyright appeal was already reviewed differently',
    )
    await transaction.commit()
    return { noticeId: appeal.copyright_notice_id, reviewIds: existingRows.map(row => row.id) }
  }

  const reviewedAt = new Date()
  const reviewIds: string[] = []
  const restrictionsById = new Map(restrictionRows.map(row => [row.id, row]))
  const reviewerId = input.currentUser.id
  for (const decision of input.decisions) {
    const restriction = restrictionsById.get(decision.restrictionId)
    assert(restriction, 422, 'Copyright restriction not found')
    // oxlint-disable-next-line no-await-in-loop -- one transaction client preserves target decision order.
    await transaction(sql`/* reviewCopyrightAppeal:apply */
      UPDATE copyright_restrictions
      SET human_reviewed_at = COALESCE(human_reviewed_at, ${reviewedAt}),
        human_review_action = COALESCE(human_review_action, ${decision.action}),
        human_reviewed_by_id = CASE WHEN human_reviewed_at IS NULL THEN ${reviewerId} ELSE human_reviewed_by_id END,
        lifted_at = CASE WHEN ${decision.action} = 'reverse' THEN COALESCE(lifted_at, ${reviewedAt}) ELSE lifted_at END,
        lifted_by_id = CASE WHEN ${decision.action} = 'reverse' AND lifted_at IS NULL THEN ${reviewerId} ELSE lifted_by_id END
      WHERE id = ${decision.restrictionId}
    `)
    // oxlint-disable-next-line no-await-in-loop -- the immutable review follows its restriction mutation.
    const { rows } = await transaction<{ id: string }>(sql`/* reviewCopyrightAppeal:record */
      INSERT INTO copyright_notice_appeal_reviews (
        copyright_notice_submission_id, copyright_restriction_id,
        copyright_notice_appeal_recommendation_id, reviewed_at, reviewed_by_id, action,
        rationale_ciphertext, manual_fallback_reason_ciphertext
      ) VALUES (
        ${input.submissionId}, ${decision.restrictionId}, ${input.recommendationId}, ${reviewedAt},
        ${reviewerId}, ${decision.action},
        ${encryptSecret(input.rationale, `copyright-appeal-review:${input.submissionId}:${decision.restrictionId}`)},
        ${input.manualFallbackReason ? encryptSecret(input.manualFallbackReason, `copyright-appeal-review-fallback:${input.submissionId}`) : null}
      ) RETURNING id
    `)
    assert(rows[0], 500, 'Copyright appeal review was not recorded')
    reviewIds.push(rows[0].id)
  }
  await transaction(sql`/* reviewCopyrightAppeal:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, actor_user_id, metadata)
    VALUES (${appeal.copyright_notice_id}, 'appeal_reviewed', ${input.currentUser.id},
      ${JSON.stringify({ submissionId: input.submissionId })}::jsonb)
  `)
  if (appeal.submitted_by_user_id)
    await createCopyrightDeliveryIntent(
      {
        noticeId: appeal.copyright_notice_id,
        submissionId: input.submissionId,
        correspondenceId: null,
        recipientUserId: appeal.submitted_by_user_id,
        recipientRole: 'poster',
        deliveryKind: 'status_update',
        channel: 'in_app',
        idempotencyKey: `copyright-appeal-review:${input.submissionId}:poster-outcome`,
      },
      transaction,
    )
  else
    await createEmailSubmitterOutcomeInTransaction(
      {
        noticeId: appeal.copyright_notice_id,
        submissionId: input.submissionId,
        bodyText: 'Your appeal has been reviewed. See the copyright case for the recorded outcome.',
        idempotencyKey: `copyright-appeal-review:${input.submissionId}:email-outcome`,
      },
      transaction,
    )
  await transaction.commit()
  return { noticeId: appeal.copyright_notice_id, reviewIds }
}

export async function reviewCopyrightCounterNotice(input: {
  submissionId: string
  currentUser: PrivateUser
  accepted: boolean
  rationale: string
}): Promise<{ noticeId: string; assessmentId: string; deadlineId: string | null }> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  assertBoundedRationale(input.rationale)
  await using transaction = await beginTransaction()
  await transaction(sql`/* reviewCopyrightCounterNotice:lock */
    SELECT pg_advisory_xact_lock(hashtextextended(${`copyright-counter-review:${input.submissionId}`}, 0))
  `)
  const { rows: existingRows } = await transaction<{
    copyright_notice_id: string
    accepted: boolean
    assessment_id: string
    deadline_id: string | null
  }>(sql`/* reviewCopyrightCounterNotice:existing */
    SELECT submission.copyright_notice_id, review.accepted,
      review.copyright_notice_submission_assessment_id AS assessment_id,
      review.copyright_notice_deadline_id AS deadline_id
    FROM copyright_notice_counter_notice_reviews review
    JOIN copyright_notice_submissions submission
      ON submission.id = review.copyright_notice_submission_id
    WHERE review.copyright_notice_submission_id = ${input.submissionId}
    FOR UPDATE OF review, submission
  `)
  const existing = existingRows[0]
  if (existing) {
    assert(existing.accepted === input.accepted, 409, 'Counter-notice was already reviewed')
    await transaction.commit()
    return {
      noticeId: existing.copyright_notice_id,
      assessmentId: existing.assessment_id,
      deadlineId: existing.deadline_id,
    }
  }
  const { rows: submissionRows } = await transaction<{
    copyright_notice_id: string
    received_at: Date
    jurisdiction: string
    target_ids: string[]
  }>(sql`/* reviewCopyrightCounterNotice:submission */
    SELECT submission.copyright_notice_id, submission.received_at, notice.jurisdiction,
      ARRAY(
        SELECT submission_target.copyright_notice_target_id
        FROM copyright_notice_submission_targets submission_target
        WHERE submission_target.copyright_notice_submission_id = submission.id
        ORDER BY submission_target.copyright_notice_target_id
      ) AS target_ids
    FROM copyright_notice_submissions submission
    JOIN copyright_notices notice ON notice.id = submission.copyright_notice_id
    WHERE submission.id = ${input.submissionId} AND submission.kind = 'counter_notice'
    FOR UPDATE OF submission, notice
  `)
  const submission = submissionRows[0]
  assert(submission, 404, 'Copyright counter-notice not found')
  assert(submission.jurisdiction === 'us_dmca', 422, 'Only US DMCA counter-notices are supported')
  const reviewedAt = new Date()
  const { rows: assessmentRows } = await transaction<{
    id: string
  }>(sql`/* reviewCopyrightCounterNotice:assessment */
    INSERT INTO copyright_notice_submission_assessments (
      copyright_notice_submission_id, assessed_at, assessed_by_id, substantially_compliant
    ) VALUES (${input.submissionId}, ${reviewedAt}, ${input.currentUser.id}, ${input.accepted})
    RETURNING id
  `)
  const assessment = assessmentRows[0]
  assert(assessment, 500, 'Counter-notice assessment was not recorded')
  let deadlineId: string | null = null
  if (input.accepted) {
    await transaction(sql`/* reviewCopyrightCounterNotice:targets */
      INSERT INTO copyright_notice_counter_notice_assessment_targets (
        copyright_notice_submission_assessment_id, copyright_notice_target_id
      ) SELECT ${assessment.id}, unnest(${submission.target_ids}::uuid[])
    `)
    const window = calculateUsCounterNoticeRestorationWindow(submission.received_at)
    const { rows } = await transaction<{
      id: string
    }>(sql`/* reviewCopyrightCounterNotice:deadline */
      INSERT INTO copyright_notice_deadlines (
        copyright_notice_id, qualifying_counter_notice_assessment_id, earliest_restoration_at,
        escalation_at, restoration_deadline_at
      ) VALUES (${submission.copyright_notice_id}, ${assessment.id}, ${window.earliest_restoration_at},
        ${window.escalation_at}, ${window.restoration_deadline_at})
      RETURNING id
    `)
    deadlineId = rows[0]?.id ?? null
    assert(deadlineId, 500, 'Counter-notice deadline was not created')
    await createCounterNoticeForwardingInTransaction(
      {
        assessmentId: assessment.id,
        earliestRestorationAt: window.earliest_restoration_at,
      },
      transaction,
    )
  }
  await transaction(sql`/* reviewCopyrightCounterNotice:record */
    INSERT INTO copyright_notice_counter_notice_reviews (
      copyright_notice_submission_id, copyright_notice_submission_assessment_id,
      copyright_notice_deadline_id, reviewed_at, reviewed_by_id, accepted, rationale_ciphertext
    ) VALUES (${input.submissionId}, ${assessment.id}, ${deadlineId}, ${reviewedAt},
      ${input.currentUser.id}, ${input.accepted},
      ${encryptSecret(input.rationale, `copyright-counter-review:${input.submissionId}`)})
  `)
  await transaction(sql`/* reviewCopyrightCounterNotice:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, actor_user_id, metadata)
    VALUES (${submission.copyright_notice_id}, 'counter_notice_reviewed', ${input.currentUser.id},
      ${JSON.stringify({ submissionId: input.submissionId, accepted: input.accepted })}::jsonb)
  `)
  const { rows: submitterRows } = await transaction<{ submitted_by_user_id: string | null }>(
    sql`/* reviewCopyrightCounterNotice:submitter */
      SELECT submitted_by_user_id FROM copyright_notice_submissions
      WHERE id = ${input.submissionId}
    `,
  )
  if (submitterRows[0]?.submitted_by_user_id) {
    await createCopyrightDeliveryIntent(
      {
        noticeId: submission.copyright_notice_id,
        submissionId: input.submissionId,
        correspondenceId: null,
        recipientUserId: submitterRows[0].submitted_by_user_id,
        recipientRole: 'poster',
        deliveryKind: 'status_update',
        channel: 'in_app',
        idempotencyKey: `copyright-counter-review:${input.submissionId}:poster-outcome`,
      },
      transaction,
    )
  } else
    await createEmailSubmitterOutcomeInTransaction(
      {
        noticeId: submission.copyright_notice_id,
        submissionId: input.submissionId,
        bodyText: input.accepted
          ? 'Your counter-notice was accepted and forwarded to the original claimant.'
          : 'Your counter-notice was reviewed and was not accepted.',
        idempotencyKey: `copyright-counter-review:${input.submissionId}:email-outcome`,
      },
      transaction,
    )
  await transaction.commit()
  return { noticeId: submission.copyright_notice_id, assessmentId: assessment.id, deadlineId }
}

async function createEmailSubmitterOutcomeInTransaction(
  input: { noticeId: string; submissionId: string; bodyText: string; idempotencyKey: string },
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  const { rows } = await transaction<{
    sender_email_ciphertext: string
    ses_message_id: string
  }>(sql`/* createEmailSubmitterOutcomeInTransaction:recipient */
    SELECT parse.sender_email_ciphertext, intake.ses_message_id
    FROM copyright_notice_correspondence_messages correspondence
    JOIN copyright_notice_email_intakes intake
      ON intake.id = correspondence.copyright_notice_email_intake_id
    JOIN copyright_notice_email_intake_parses parse
      ON parse.copyright_notice_email_intake_id = intake.id AND parse.status = 'succeeded'
    WHERE correspondence.copyright_notice_submission_id = ${input.submissionId}
      AND correspondence.direction = 'inbound'
    ORDER BY correspondence.id
    LIMIT 1
  `)
  const recipient = rows[0]
  if (!recipient) return
  const correspondence = await createDeterministicCopyrightCorrespondenceInTransaction(
    {
      noticeId: input.noticeId,
      submissionId: input.submissionId,
      correspondenceKind: 'status_update',
      bodyText: input.bodyText,
    },
    transaction,
  )
  await createCopyrightDeliveryIntent(
    {
      noticeId: input.noticeId,
      submissionId: input.submissionId,
      correspondenceId: correspondence.id,
      recipientUserId: null,
      recipientRole: 'correspondent',
      deliveryKind: 'status_update',
      channel: 'email',
      idempotencyKey: input.idempotencyKey,
      recipientEmail: decryptSecret(
        recipient.sender_email_ciphertext,
        copyrightEmailIntakePurpose(recipient.ses_message_id),
      ),
    },
    transaction,
  )
}

function assertBoundedRationale(value: string): void {
  assert(value.trim() && value.length <= 10_000, 422, 'rationale is required')
}
