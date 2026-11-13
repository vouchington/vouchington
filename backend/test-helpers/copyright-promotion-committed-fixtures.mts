import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { copyrightEmailPromotionInput } from './services/copyright-notices/email-thread-cases.mts'
import {
  buildEmailNotice,
  recordEmailPromotion,
} from '../services/copyright-notices/email-promotion-record.mts'
import { createCopyrightNoticeAggregateInTransaction } from '../services/copyright-notices/create.mts'
import {
  copyrightEmailIntakePurpose,
  type CopyrightEmailIntake,
} from '../services/copyright-notices/email-intakes.mts'
import { getCopyrightEmailThreadGraphMaxRows } from '../services/copyright-notices/config.mts'
import {
  readCopyrightEmailThreadGraph,
  readCopyrightEmailGraphTokens,
} from '../services/copyright-notices/email-thread-graph.mts'
import { assertCopyrightEmailUnresolvedReply } from '../services/copyright-notices/email-thread-review-path.mts'
import {
  assertNoThreadCorrespondenceDecision,
  assertRecommendationScope,
} from '../services/copyright-notices/email-promotion-admission-guards.mts'
import { seedCopyrightSubmissionAssessment } from './copyright-notice-submissions.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import type { PromoteCopyrightEmailIntakeInput } from '../services/copyright-notices/email-promotion-input.mts'

/** Uniqueness also detects orphan legal cases without depending on a target/link surviving. */
export async function ownedCopyrightEmailPromotionInput(
  ...args: Parameters<typeof copyrightEmailPromotionInput>
) {
  return {
    ...(await copyrightEmailPromotionInput(...args)),
    workDescription: `Owned email promotion ${crypto.randomUUID()}`,
  }
}

/** Independent committed approval prerequisite for replay/classification, using canonical producers. */
export async function seedCommittedCopyrightPromotion(input: PromoteCopyrightEmailIntakeInput) {
  const cap = await getCopyrightEmailThreadGraphMaxRows()
  await using transaction = await beginTransaction()
  const { rows } =
    await transaction<CopyrightEmailIntake>(sql`/* seedCommittedCopyrightPromotion:intake */
    SELECT intake.*, object.storage_key AS raw_storage_key FROM copyright_notice_email_intakes intake
    JOIN copyright_notice_storage_objects object ON object.id = intake.raw_storage_object_id WHERE intake.id = ${input.intakeId}`)
  const intake = rows[0]
  if (!intake) throw new Error('Owned promotion source disappeared')
  await assertCopyrightEmailUnresolvedReply(transaction, intake.id)
  await assertNoThreadCorrespondenceDecision(transaction, intake.id)
  await assertRecommendationScope(transaction, input.recommendationId, intake.id)
  const graph = await readCopyrightEmailThreadGraph(transaction, intake.id, cap)
  const tokens = graph.overflow
    ? { overflow: false }
    : await readCopyrightEmailGraphTokens(transaction, graph.intakeIds, cap)
  const purpose = copyrightEmailIntakePurpose(intake.amazon_ses_message_id)
  const notice = await createCopyrightNoticeAggregateInTransaction(
    buildEmailNotice(input, purpose, intake.received_at),
    transaction,
  )
  const submissionId = await recordEmailPromotion(
    transaction,
    intake,
    notice.id,
    input,
    purpose,
    graph,
    !graph.overflow && !tokens.overflow,
  )
  await transaction.commit()
  const assessment = await seedCopyrightSubmissionAssessment({
    submissionId,
    assessedAt: new Date(),
    currentUser: input.currentUser,
    substantiallyCompliant: true,
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate) throw new Error('Owned committed promotion disappeared')
  for (const target of aggregate.targets) {
    await seedCopyrightStatementRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: assessment.id,
      revision: target.placement_revision,
      moderatorId: input.currentUser.id,
    })
  }
  return { noticeId: notice.id, submissionId }
}
