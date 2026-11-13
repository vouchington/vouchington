import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { appendCopyrightSubmissionAssessmentInTransaction } from '../services/copyright-notices/compliance.mts'
import { createCopyrightClaimantDecisionNoticeInTransaction } from '../services/copyright-notices/claimant-decision-notices.mts'
import { reverseAutomatedCopyrightRestrictionsInTransaction } from '../services/copyright-notices/form-reviews-reversal.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import type { createSignedInCopyrightForm } from './services/copyright-notices/screened-form.mts'
import type { PrivateUser } from '../services/users/types.mts'

type Form = Awaited<ReturnType<typeof createSignedInCopyrightForm>>

/** Complete committed authority for tests whose subject consumes an existing legal decision. */
export async function seedServiceReviewRestriction(
  form: Form,
  moderator: PrivateUser,
  screeningId?: string,
) {
  await using transaction = await beginTransaction()
  const assessment = await appendCopyrightSubmissionAssessmentInTransaction(
    {
      submissionId: form.intake.copyright_notice_submission_id,
      assessedAt: new Date(),
      currentUser: screeningId ? null : moderator,
      substantiallyCompliant: true,
      ...(screeningId ? { copyrightFormScreeningId: screeningId } : {}),
    },
    transaction,
  )
  await transaction.commit()
  const noticeId = form.intake.copyright_notice_id
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  if (!aggregate) throw new Error('Owned service review notice disappeared')
  for (const target of aggregate.targets) {
    await seedCopyrightStatementRestriction({
      noticeId,
      targetId: target.id,
      assessmentId: assessment.id,
      revision: target.placement_revision,
      moderatorId: moderator.id,
      automated: !!screeningId,
    })
  }
  await using noticeTransaction = await beginTransaction()
  await createCopyrightClaimantDecisionNoticeInTransaction(
    { noticeId, event: 'restricted' },
    noticeTransaction,
  )
  await noticeTransaction.commit()
}

/** The current human assessment, intake decision, misuse and reversal effects commit in RC setup. */
export async function seedServiceFormDecision(
  input: {
    intakeId: string
    currentUser: PrivateUser
    is_accepted: boolean
    rationale: string
  },
  options: { deferReversal?: boolean } = {},
) {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    copyright_notice_id: string
    copyright_notice_submission_id: string
    current_assessment_identity_id: string | null
  }>(sql`/* seedServiceFormDecision:intake */
    SELECT intake.copyright_notice_id, intake.copyright_notice_submission_id,
      submission.current_assessment_identity_id FROM copyright_notice_form_intakes intake
    JOIN copyright_notice_submissions submission ON submission.id = intake.copyright_notice_submission_id
    WHERE intake.id = ${input.intakeId}`)
  const row = rows[0]
  if (!row) throw new Error('Owned service review intake disappeared')
  const assessment = await appendCopyrightSubmissionAssessmentInTransaction(
    {
      submissionId: row.copyright_notice_submission_id,
      currentUser: input.currentUser,
      substantiallyCompliant: input.is_accepted,
      assessedAt: new Date(),
      ...(row.current_assessment_identity_id
        ? { supersedesAssessmentId: row.current_assessment_identity_id }
        : {}),
    },
    transaction,
  )
  await transaction(sql`/* seedServiceFormDecision:review */
    INSERT INTO copyright_notice_form_intake_reviews (copyright_notice_form_intake_id,
      reviewed_at, reviewed_by_id, is_accepted, rationale_ciphertext)
    VALUES (${input.intakeId}, CURRENT_TIMESTAMP, ${input.currentUser.id}, ${input.is_accepted},
      ${encryptSecret(input.rationale, `copyright-form-review:${input.intakeId}`)})`)
  if (!input.is_accepted && !options.deferReversal)
    await reverseAutomatedCopyrightRestrictionsInTransaction(transaction, {
      noticeId: row.copyright_notice_id,
      submissionId: row.copyright_notice_submission_id,
      moderatorId: input.currentUser.id,
      reviewedAt: new Date(),
    })
  await transaction.commit()
  if (input.is_accepted) {
    const aggregate = await getCopyrightNoticePrivateAggregate(row.copyright_notice_id)
    if (!aggregate) throw new Error('Owned service review notice disappeared')
    for (const target of aggregate.targets)
      await seedCopyrightStatementRestriction({
        noticeId: row.copyright_notice_id,
        targetId: target.id,
        assessmentId: assessment.id,
        revision: target.placement_revision,
        moderatorId: input.currentUser.id,
      })
    await using noticeTransaction = await beginTransaction()
    await createCopyrightClaimantDecisionNoticeInTransaction(
      { noticeId: row.copyright_notice_id, event: 'restricted' },
      noticeTransaction,
    )
    await noticeTransaction.commit()
  }
}

/** Committed suspension reversal prerequisite for its idempotent job replay. */
export async function seedServiceSuspensionReversal(form: Form, moderatorId: string) {
  await using transaction = await beginTransaction()
  const reviewedAt = new Date()
  const { restrictionIds } = await reverseAutomatedCopyrightRestrictionsInTransaction(transaction, {
    noticeId: form.intake.copyright_notice_id,
    submissionId: form.intake.copyright_notice_submission_id,
    moderatorId,
    reviewedAt,
  })
  await transaction(sql`/* seedServiceSuspensionReversal */
    INSERT INTO copyright_claimant_suspension_reversals (copyright_restriction_id, reversed_at)
    SELECT id, ${reviewedAt} FROM unnest(${restrictionIds}::uuid[]) AS id`)
  await transaction.commit()
}
