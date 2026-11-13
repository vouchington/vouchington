import { beginTransaction } from '@data-stores/psql'
import { createHash } from 'node:crypto'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import type { PrivateUser } from '../services/users/types.mts'
import type { createCopyrightFormIntake } from '../services/copyright-notices/form-intakes.mts'
import { appendCopyrightSubmissionAssessmentInTransaction } from '../services/copyright-notices/compliance.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import {
  copyrightSubmissionPurpose,
  type CopyrightAppealInput,
  type CopyrightCounterNoticeInput,
} from '../services/copyright-notices/submissions.mts'
import type { CopyrightNoticeSubmissionRecord } from '../services/copyright-notices/types.mts'
import { createCopyrightDeliveryIntent } from '../services/copyright-notices/delivery-intents.mts'
import {
  lockCopyrightNoticeForLegalWrite,
  advanceCopyrightLastLegalActivityAt,
} from '../services/copyright-notices/last-legal-activity.mts'

/** Complete human form admission plus confirmed legal restriction precede every export read. */
export async function seedExportFormAcceptance(
  intake: Awaited<ReturnType<typeof createCopyrightFormIntake>>,
  moderator: PrivateUser,
  rationale: string,
) {
  await using transaction = await beginTransaction()
  const assessment = await appendCopyrightSubmissionAssessmentInTransaction(
    {
      submissionId: intake.intake.copyright_notice_submission_id,
      assessedAt: new Date(),
      currentUser: moderator,
      substantiallyCompliant: true,
    },
    transaction,
  )
  await transaction(sql`/* seedExportFormAcceptance:review */ INSERT INTO copyright_notice_form_intake_reviews
    (copyright_notice_form_intake_id,reviewed_at,reviewed_by_id,is_accepted,rationale_ciphertext)
    VALUES (${intake.intake.id},${new Date()},${moderator.id},true,${encryptSecret(rationale, `copyright-form-review:${intake.intake.id}`)})`)
  await transaction.commit()
  const aggregate = await getCopyrightNoticePrivateAggregate(intake.intake.copyright_notice_id)
  const target = aggregate?.targets[0]
  if (!target) throw new Error('Owned export target disappeared')
  await seedCopyrightStatementRestriction({
    noticeId: intake.intake.copyright_notice_id,
    targetId: target.id,
    assessmentId: assessment.id,
    revision: target.placement_revision,
    moderatorId: moderator.id,
  })
}

/** Canonical party-owned receipt, encrypted filing, target scope, audit and in-app acknowledgment. */
export async function seedExportPosterFiling(
  poster: PrivateUser,
  noticeId: string,
  kind: 'appeal' | 'counter_notice',
  input: CopyrightAppealInput | CopyrightCounterNoticeInput,
) {
  const id = uuidv7()
  const key = crypto.randomUUID()
  await using transaction = await beginTransaction()
  const notice = await lockCopyrightNoticeForLegalWrite(transaction, noticeId)
  if (!notice || notice.jurisdiction !== 'us_dmca') throw new Error('Owned export US case missing')
  const { rows } =
    await transaction<CopyrightNoticeSubmissionRecord>(sql`/* seedExportPosterFiling:submission */ INSERT INTO copyright_notice_submissions
    (id,copyright_notice_id,kind,received_at,source_kind,submitted_by_id,body_ciphertext)
    VALUES (${id},${noticeId},${kind},${new Date()},'signed_in_form',${poster.id},${encryptSecret(JSON.stringify(input), copyrightSubmissionPurpose(id))}) RETURNING id,copyright_notice_id,kind,received_at,source_kind,submitted_by_id,body_ciphertext`)
  if (!rows[0]) throw new Error('Owned export poster filing missing')
  await transaction(sql`/* seedExportPosterFiling:targets */ INSERT INTO copyright_notice_submission_targets (copyright_notice_submission_id,copyright_notice_target_id)
    SELECT ${id},target.id FROM copyright_notice_targets target WHERE target.copyright_notice_id = ${noticeId} AND target.id = ANY(${input.targetIds}::uuid[])`)
  await transaction(sql`/* seedExportPosterFiling:request */ INSERT INTO copyright_notice_submission_requests
    (copyright_notice_submission_id,requester_user_id,idempotency_key_sha256,request_sha256)
    VALUES (${id},${poster.id},${createHash('sha256').update(key.toLowerCase()).digest()},${createHash('sha256').update(JSON.stringify({ kind, input })).digest()})`)
  await transaction(sql`/* seedExportPosterFiling:event */ INSERT INTO copyright_notice_lifecycle_changes
    (copyright_notice_id,change_type,changed_by_id,copyright_notice_submission_id) VALUES (${noticeId},${`${kind}_received`},${poster.id},${id})`)
  await advanceCopyrightLastLegalActivityAt(transaction, notice)
  await createCopyrightDeliveryIntent(
    {
      noticeId,
      submissionId: id,
      correspondenceId: null,
      recipientUserId: poster.id,
      recipientRole: 'poster',
      deliveryKind: 'status_update',
      channel: 'in_app',
      idempotencyKey: `copyright-submission:${id}:poster-receipt`,
    },
    transaction,
  )
  await transaction.commit()
  return { submission: rows[0] }
}
