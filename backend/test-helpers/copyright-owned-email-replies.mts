import { beginTransaction } from '@data-stores/psql'
import type { PrivateUser } from '../services/users/types.mts'
import { copyrightEmailIntakePurpose } from '../services/copyright-notices/email-intakes.mts'
import { getCopyrightEmailThreadGraphMaxRows } from '../services/copyright-notices/config.mts'
import {
  readCopyrightEmailThreadGraph,
  readCopyrightEmailGraphTokens,
} from '../services/copyright-notices/email-thread-graph.mts'
import { recordCopyrightEmailAncestorEdges } from '../services/copyright-notices/email-thread-ancestors.mts'
import {
  buildEmailNotice,
  recordEmailPromotion,
} from '../services/copyright-notices/email-promotion-record.mts'
import { createCopyrightNoticeAggregateInTransaction } from '../services/copyright-notices/create.mts'
import { createRetentionParsedEmail } from './services/copyright-notices/retention-parsed-email.mts'
import { copyrightEmailPromotionInput } from './services/copyright-notices/email-thread-cases.mts'
import { createCommittedCopyrightEmailCase } from './copyright-committed-email-case.mts'
import { seedCopyrightSubmissionAssessment } from './copyright-notice-submissions.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'

/** Reference facts may precede derivation; promotion replay remains the actual link-writing subject. */
export async function createCommittedCopyrightPendingReply(moderator: PrivateUser) {
  const messageId = `<${crypto.randomUUID()}@example.test>`
  const parent = await createCommittedCopyrightEmailCase({ moderator, messageId })
  const reply = await createRetentionParsedEmail('owned-pending-reply', {
    replyReferences: [messageId],
  })
  await using transaction = await beginTransaction()
  await recordCopyrightEmailAncestorEdges(transaction, reply.id)
  await transaction.commit()
  const input = await copyrightEmailPromotionInput(moderator, parent.intakeId)
  return { input, noticeId: parent.noticeId, rootId: parent.intakeId, replyId: reply.id }
}

/** A genuine owned token-budget overflow at the normal configured limit, with no shared config mutation. */
export async function createCommittedCopyrightOverflowReply(moderator: PrivateUser) {
  const maxRows = await getCopyrightEmailThreadGraphMaxRows()
  const messageId = `<${crypto.randomUUID()}@example.test>`
  const root = await createRetentionParsedEmail('owned-overflow-root', { messageId })
  const reply = await createRetentionParsedEmail('owned-overflow-reply', {
    replyReferences: [
      messageId,
      ...Array.from({ length: maxRows }, () => `<${crypto.randomUUID()}@example.test>`),
    ],
  })
  const input = await copyrightEmailPromotionInput(moderator, root.id)
  await using transaction = await beginTransaction()
  await recordCopyrightEmailAncestorEdges(transaction, reply.id)
  const graph = await readCopyrightEmailThreadGraph(transaction, root.id, maxRows)
  const tokens = graph.overflow
    ? { overflow: false }
    : await readCopyrightEmailGraphTokens(transaction, graph.intakeIds, maxRows)
  if (!graph.overflow && !tokens.overflow)
    throw new Error('Owned fixture did not reach the normal graph budget')
  const purpose = copyrightEmailIntakePurpose(root.amazon_ses_message_id)
  const notice = await createCopyrightNoticeAggregateInTransaction(
    buildEmailNotice(input, purpose, root.received_at),
    transaction,
  )
  const submissionId = await recordEmailPromotion(
    transaction,
    root,
    notice.id,
    input,
    purpose,
    graph,
    false,
  )
  await transaction.commit()
  const assessment = await seedCopyrightSubmissionAssessment({
    submissionId,
    assessedAt: new Date(),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate) throw new Error('Owned overflow case disappeared')
  for (const target of aggregate.targets) {
    await seedCopyrightStatementRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: assessment.id,
      revision: target.placement_revision,
      moderatorId: moderator.id,
    })
  }
  return { noticeId: notice.id, rootId: root.id, replyId: reply.id }
}
