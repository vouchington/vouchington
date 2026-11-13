import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import type { PrivateUser } from '../services/users/types.mts'
import { currentUserCanReviewCopyrightNotices } from '../services/copyright-notices/authorization.mts'
import {
  createCopyrightEmailIntake,
  copyrightEmailIntakePurpose,
} from '../services/copyright-notices/email-intakes.mts'
import { createCopyrightEmailIntakeResponseInTransaction } from '../services/copyright-notices/email-intake-reply.mts'
import { isCopyrightIntakeEnabled } from '../services/copyright-notices/activation.mts'
import {
  buildCopyrightEmailThreadReferenceRows,
  encryptCopyrightEmailReplyHeaders,
} from '../services/copyright-notices/email-thread-references.mts'
import {
  resolveCopyrightEmailThreadTokenIds,
  insertResolvedCopyrightEmailThreadReferences,
  recordCopyrightEmailAncestorEdges,
} from '../services/copyright-notices/email-thread-ancestors.mts'
import { copyrightEmailMessageIdIsAmbiguous } from '../services/copyright-notices/email-thread-match.mts'
import { getCopyrightEmailThreadGraphMaxRows } from '../services/copyright-notices/config.mts'
import {
  readCopyrightEmailThreadGraph,
  readCopyrightEmailGraphTokens,
} from '../services/copyright-notices/email-thread-graph.mts'
import {
  buildEmailNotice,
  recordEmailPromotion,
} from '../services/copyright-notices/email-promotion-record.mts'
import { createCopyrightNoticeAggregateInTransaction } from '../services/copyright-notices/create.mts'
import { copyrightEmailPromotionInput } from './services/copyright-notices/email-thread-cases.mts'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from './services/copyright-notices/email-ses-verdicts.mts'
import { seedCopyrightSubmissionAssessment } from './copyright-notice-submissions.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'

/** Complete committed email admission dependency; actual promotion subjects still call the service. */
export async function createCommittedCopyrightEmailCase(input: {
  moderator: PrivateUser
  messageId: string
}) {
  if (!currentUserCanReviewCopyrightNotices(input.moderator))
    throw new Error('Email fixture requires a review actor')
  const intake = await seedInitialEmail(input.messageId)
  const promotion = await copyrightEmailPromotionInput(input.moderator, intake.id)
  const maxRows = await getCopyrightEmailThreadGraphMaxRows()
  await using transaction = await beginTransaction()
  const graph = await readCopyrightEmailThreadGraph(transaction, intake.id, maxRows)
  const tokens = graph.overflow
    ? { overflow: false }
    : await readCopyrightEmailGraphTokens(transaction, graph.intakeIds, maxRows)
  const purpose = copyrightEmailIntakePurpose(intake.amazon_ses_message_id)
  const notice = await createCopyrightNoticeAggregateInTransaction(
    buildEmailNotice(promotion, purpose, intake.received_at),
    transaction,
  )
  const submissionId = await recordEmailPromotion(
    transaction,
    intake,
    notice.id,
    promotion,
    purpose,
    graph,
    !graph.overflow && !tokens.overflow,
  )
  await transaction.commit()
  const assessment = await seedCopyrightSubmissionAssessment({
    submissionId,
    assessedAt: new Date(),
    currentUser: input.moderator,
    substantiallyCompliant: true,
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate) throw new Error('Committed email case disappeared')
  for (const target of aggregate.targets) {
    await seedCopyrightStatementRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: assessment.id,
      revision: target.placement_revision,
      moderatorId: input.moderator.id,
    })
  }
  return { intakeId: intake.id, noticeId: notice.id }
}

async function seedInitialEmail(messageId: string) {
  const sesMessageId = `ses-thread-${crypto.randomUUID()}`
  const fromEmail = `claimant-${crypto.randomUUID()}@example.test`
  const { intake } = await createCopyrightEmailIntake({
    sesMessageId,
    receivedAt: new Date(),
    rawStorageKey: `email/${sesMessageId}/original.eml`,
    rawSha256: Buffer.alloc(32, 4),
    rawMimeType: 'message/rfc822',
    rawByteSize: 24,
    sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
  })
  const purpose = copyrightEmailIntakePurpose(sesMessageId)
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedCommittedInitialEmail:parse */
    INSERT INTO copyright_notice_email_intake_parses
      (copyright_notice_email_intake_id, status, sender_email_ciphertext, subject_ciphertext,
       body_ciphertext, message_id_ciphertext, reply_references_ciphertext)
    VALUES (${intake.id}, 'succeeded', ${encryptSecret(fromEmail, purpose)},
      ${encryptSecret('Copyright notice', purpose)}, ${encryptSecret('Threaded copyright email.', purpose)},
      ${encryptSecret(messageId, purpose)}, ${encryptCopyrightEmailReplyHeaders({ inReplyTo: [], references: [] }, purpose)})`)
  if (isCopyrightIntakeEnabled())
    await createCopyrightEmailIntakeResponseInTransaction(
      {
        intakeId: intake.id,
        recipientEmail: fromEmail,
        responseKind: 'received',
        responseMessage: null,
      },
      transaction,
    )
  const rows = buildCopyrightEmailThreadReferenceRows({ messageId, inReplyTo: [], references: [] })
  const tokenIds = await resolveCopyrightEmailThreadTokenIds(
    transaction,
    rows.map(row => row.lookup_digest),
  )
  await insertResolvedCopyrightEmailThreadReferences(transaction, intake.id, rows, tokenIds)
  if (!(await copyrightEmailMessageIdIsAmbiguous(transaction, intake.id)))
    await recordCopyrightEmailAncestorEdges(transaction, intake.id)
  await transaction.commit()
  return intake
}
