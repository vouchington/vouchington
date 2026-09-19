import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightCorrespondenceKind, CopyrightCorrespondenceRecord } from './types.mts'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'

type OutboundCompositionKind = 'deterministic_template' | 'staff' | 'agent'

export async function createOutboundCopyrightCorrespondence(input: {
  noticeId: string
  submissionId: string | null
  correspondenceKind: CopyrightCorrespondenceKind
  compositionKind: OutboundCompositionKind
  bodyCiphertext: string
  draftedById: string | null
}): Promise<CopyrightCorrespondenceRecord> {
  await using transaction = await beginTransaction()
  const { rows } =
    await transaction<CopyrightCorrespondenceRecord>(sql`/* createOutboundCopyrightCorrespondence */
    INSERT INTO copyright_notice_correspondence_messages (
      copyright_notice_id, copyright_notice_submission_id, direction, correspondence_kind,
      composition_kind, body_ciphertext, drafted_by_id
    )
    SELECT
      ${input.noticeId}, ${input.submissionId}, 'outbound', ${input.correspondenceKind},
      ${input.compositionKind}, ${input.bodyCiphertext}, ${input.draftedById}
    FROM copyright_notices notice
    WHERE notice.id = ${input.noticeId}
      AND (
        ${input.submissionId}::uuid IS NULL
        OR EXISTS (
          SELECT 1 FROM copyright_notice_submissions submission
          WHERE submission.id = ${input.submissionId}
            AND submission.copyright_notice_id = notice.id
        )
      )
    RETURNING id, copyright_notice_id, copyright_notice_submission_id, direction, correspondence_kind,
      composition_kind, body_ciphertext, drafted_by_id, approved_at, approved_by_id, sent_at
  `)
  const correspondence = rows[0]
  assert(correspondence, 404, 'Copyright notice or case submission not found')
  await transaction(sql`/* createOutboundCopyrightCorrespondence:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, metadata)
    VALUES (${input.noticeId}, 'outbound_correspondence_created', '{}'::jsonb)
  `)
  await transaction.commit()
  return correspondence
}

export async function approveCopyrightCorrespondence(input: {
  currentUser: PrivateUser
  correspondenceId: string
  approvedAt: Date
}): Promise<CopyrightCorrespondenceRecord> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  await using transaction = await beginTransaction()
  const { rows } =
    await transaction<CopyrightCorrespondenceRecord>(sql`/* approveCopyrightCorrespondence */
    UPDATE copyright_notice_correspondence_messages
    SET approved_at = ${input.approvedAt}, approved_by_id = ${input.currentUser.id}
    WHERE id = ${input.correspondenceId}
      AND direction = 'outbound'
      AND composition_kind = 'agent'
      AND approved_at IS NULL
    RETURNING id, copyright_notice_id, copyright_notice_submission_id, direction, correspondence_kind,
      composition_kind, body_ciphertext, drafted_by_id, approved_at, approved_by_id, sent_at
  `)
  const correspondence = rows[0]
  assert(correspondence, 409, 'Only an unapproved agent-composed outbound message can be approved')
  await transaction(sql`/* approveCopyrightCorrespondence:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, actor_user_id, metadata)
    VALUES (${correspondence.copyright_notice_id}, 'agent_correspondence_approved', ${input.currentUser.id}, '{}'::jsonb)
  `)
  await transaction.commit()
  return correspondence
}
