import type { TransactionQuery } from '@data-stores/psql/types'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import type {
  CopyrightEmailAppealSubmission,
  CopyrightEmailCorrespondenceKind,
  CopyrightEmailCounterNoticeSubmission,
  CopyrightEmailOtherSubmission,
} from './email-correspondence-guards.mts'
import { createGuestTerritorialComplaintFromEmail } from './territorial-complaint-email.mts'
import { copyrightSubmissionPurpose } from './submissions.mts'

type AdmittedEmailCorrespondencePending = {
  id: string
  amazon_ses_message_id: string
  received_at: Date
  raw_storage_object_id: string | null
  raw_sha256: Buffer
  raw_media_type_id: string
  raw_byte_size: number
  notice_id: string
  body_ciphertext: string
}

export async function insertAdmittedCopyrightEmailSubmission(
  transaction: TransactionQuery,
  input: {
    intakeId: string
    kind: CopyrightEmailCorrespondenceKind
    targetIds: string[]
    structuredSubmission:
      | CopyrightEmailAppealSubmission
      | CopyrightEmailCounterNoticeSubmission
      | CopyrightEmailOtherSubmission
  },
  pending: AdmittedEmailCorrespondencePending,
  correspondenceId: string,
): Promise<{ submissionId: string; correspondenceId: string }> {
  const submissionId = uuidv7()
  const { rows: submissions } = await transaction<{
    id: string
  }>(sql`/* admitCopyrightEmailCorrespondence:submission */
    INSERT INTO copyright_notice_submissions (
      id, copyright_notice_id, submitted_by_id, kind, received_at, source_kind, body_ciphertext
    ) VALUES (
      ${submissionId}, ${pending.notice_id}, NULL, ${input.kind}::copyright_notice_submission_kinds, ${pending.received_at}, 'email',
      ${encryptSecret(JSON.stringify(input.structuredSubmission), copyrightSubmissionPurpose(submissionId))}
    ) RETURNING id
  `)
  const submission = submissions[0]
  assert(submission, 500, 'Failed to record copyright email submission')
  if (input.kind === 'complaint')
    await createGuestTerritorialComplaintFromEmail(
      {
        noticeId: pending.notice_id,
        submissionId: submission.id,
        receivedAt: pending.received_at,
        sesMessageId: pending.amazon_ses_message_id,
        bodyCiphertext: pending.body_ciphertext,
      },
      transaction,
    )
  if (input.targetIds.length > 0) {
    const { rows: targetRows } =
      await transaction(sql`/* admitCopyrightEmailCorrespondence:targets */
      INSERT INTO copyright_notice_submission_targets (
        copyright_notice_submission_id, copyright_notice_target_id
      ) SELECT ${submission.id}, target.id
      FROM copyright_notice_targets target
      WHERE target.copyright_notice_id = ${pending.notice_id}
        AND target.id = ANY(${input.targetIds}::uuid[])
      RETURNING copyright_notice_target_id
    `)
    assert(
      targetRows.length === input.targetIds.length,
      422,
      'Correspondence target is not in this case',
    )
  }
  await transaction(sql`/* admitCopyrightEmailCorrespondence:evidence */
    INSERT INTO copyright_notice_evidence_artifacts (
      copyright_notice_submission_id, storage_object_id, sha256, media_type_id, byte_size
    ) VALUES (${submission.id}, ${pending.raw_storage_object_id}, ${pending.raw_sha256}, ${pending.raw_media_type_id}, ${pending.raw_byte_size})
  `)
  const { rows: correspondenceRows } = await transaction<{
    id: string
  }>(sql`/* admitCopyrightEmailCorrespondence:correspondence */
    INSERT INTO copyright_notice_correspondence_messages (
      id, copyright_notice_id, copyright_notice_submission_id, copyright_notice_email_intake_id,
      direction, composition_kind, correspondence_kind, body_ciphertext
    ) VALUES (${correspondenceId}, ${pending.notice_id}, ${submission.id}, ${input.intakeId}, 'inbound', 'inbound', 'inbound_message', ${pending.body_ciphertext})
    RETURNING id
  `)
  const correspondence = correspondenceRows[0]
  assert(correspondence, 500, 'Failed to record copyright email correspondence')
  return { submissionId: submission.id, correspondenceId: correspondence.id }
}
