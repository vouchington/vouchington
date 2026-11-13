import { encryptSecret } from '@modules/token-secrets'
import { v7 as uuidv7 } from 'uuid'
import {
  copyrightSubmissionPurpose,
  type CopyrightCounterNoticeInput,
} from '../services/copyright-notices/submissions.mts'
import { createCopyrightDeliveryIntent } from '../services/copyright-notices/delivery-intents.mts'
import { appendCopyrightSubmissionAssessmentInTransaction } from '../services/copyright-notices/compliance.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  AssessmentInput,
  CopyrightNoticeSubmissionRecord,
  CopyrightSubmissionKind,
  CopyrightSubmissionSourceKind,
} from '../services/copyright-notices/types.mts'

export async function appendTestCopyrightNoticeSubmission(input: {
  noticeId: string
  kind: CopyrightSubmissionKind
  receivedAt: Date
  sourceKind: CopyrightSubmissionSourceKind
  submittedByUserId: string | null
  bodyCiphertext: string
}): Promise<CopyrightNoticeSubmissionRecord> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* appendCopyrightNoticeSubmission:lockNotice */
    SELECT id FROM copyright_notices WHERE id = ${input.noticeId} FOR UPDATE
  `)
  const { rows } =
    await transaction<CopyrightNoticeSubmissionRecord>(sql`/* appendCopyrightNoticeSubmission */
      INSERT INTO copyright_notice_submissions (
        copyright_notice_id, kind, received_at, source_kind, submitted_by_id, body_ciphertext
      ) VALUES (
        ${input.noticeId}, ${input.kind}, ${input.receivedAt}, ${input.sourceKind}, ${input.submittedByUserId}, ${input.bodyCiphertext}
      )
      RETURNING id, copyright_notice_id, kind, received_at, source_kind, submitted_by_id, body_ciphertext
    `)
  const submission = rows[0]
  if (!submission) throw new Error('Failed to append copyright notice submission')
  await transaction.commit()
  return submission
}

/** Seed an assessment dependency with canonical writes/triggers, without a competing request owner. */
export async function seedCopyrightSubmissionAssessment(input: AssessmentInput) {
  await using transaction = await beginTransaction()
  const assessment = await appendCopyrightSubmissionAssessmentInTransaction(input, transaction)
  await transaction.commit()
  return assessment
}

/** A counter-notice dependency for assessment/deadline subjects, with canonical target and receipt rows. */
export async function seedCopyrightCounterNotice(
  noticeId: string,
  actorId: string,
  targetIds: string[],
) {
  const id = uuidv7()
  const body: CopyrightCounterNoticeInput = {
    name: 'Fixture poster',
    address: '1 Main Street',
    telephone: '555-0100',
    consentToFederalJurisdiction: true,
    consentToServiceOfProcess: true,
    goodFaithMisidentificationUnderPenaltyOfPerjury: true,
    electronicSignature: 'Fixture poster',
    targetIds,
  }
  await using transaction = await beginTransaction()
  const { rows } =
    await transaction<CopyrightNoticeSubmissionRecord>(sql`/* seedCopyrightCounterNotice */
    INSERT INTO copyright_notice_submissions
      (id, copyright_notice_id, kind, received_at, source_kind, submitted_by_id, body_ciphertext)
    VALUES (${id}, ${noticeId}, 'counter_notice', CURRENT_TIMESTAMP, 'signed_in_form', ${actorId},
      ${encryptSecret(JSON.stringify(body), copyrightSubmissionPurpose(id))})
    RETURNING id, copyright_notice_id, kind, received_at, source_kind, submitted_by_id, body_ciphertext`)
  const submission = rows[0]
  if (!submission) throw new Error('Owned counter-notice missing')
  await transaction(sql`/* seedCopyrightCounterNoticeTargets */
    INSERT INTO copyright_notice_submission_targets (copyright_notice_submission_id, copyright_notice_target_id)
    SELECT ${id}, unnest(${targetIds}::uuid[])`)
  await transaction(sql`/* seedCopyrightCounterNoticeEvent */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id, copyright_notice_submission_id)
    VALUES (${noticeId}, 'counter_notice_received', ${actorId}, ${id})`)
  await createCopyrightDeliveryIntent(
    {
      noticeId,
      submissionId: id,
      correspondenceId: null,
      recipientUserId: actorId,
      recipientRole: 'poster',
      deliveryKind: 'status_update',
      channel: 'in_app',
      idempotencyKey: `copyright-submission:${id}:poster-receipt`,
    },
    transaction,
  )
  await transaction.commit()
  return { submission }
}
