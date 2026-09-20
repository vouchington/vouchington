import { createHash } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import type { CopyrightNoticeSubmissionRecord } from './types.mts'

export type CopyrightAppealInput = {
  reason: string
  targetIds: string[]
}

export type CopyrightCounterNoticeInput = {
  name: string
  address: string
  telephone: string
  consentToFederalJurisdiction: boolean
  consentToServiceOfProcess: boolean
  goodFaithMisidentificationUnderPenaltyOfPerjury: boolean
  electronicSignature: string
  targetIds: string[]
}

export async function createCopyrightAppeal(
  currentUser: PrivateUser,
  noticeId: string,
  idempotencyKey: string,
  input: CopyrightAppealInput,
): Promise<{ submission: CopyrightNoticeSubmissionRecord; isDuplicate: boolean }> {
  assert(input.reason.trim(), 422, 'Appeal reason is required')
  return createAuthenticatedCopyrightSubmission(
    currentUser,
    noticeId,
    idempotencyKey,
    'appeal',
    input,
  )
}

export async function createCopyrightCounterNotice(
  currentUser: PrivateUser,
  noticeId: string,
  idempotencyKey: string,
  input: CopyrightCounterNoticeInput,
): Promise<{ submission: CopyrightNoticeSubmissionRecord; isDuplicate: boolean }> {
  assert(input.name.trim(), 422, 'name is required')
  assert(input.address.trim(), 422, 'address is required')
  assert(input.telephone.trim(), 422, 'telephone is required')
  assert(
    input.consentToFederalJurisdiction,
    422,
    'consent_to_federal_jurisdiction must be accepted',
  )
  assert(input.consentToServiceOfProcess, 422, 'consent_to_service_of_process must be accepted')
  assert(
    input.goodFaithMisidentificationUnderPenaltyOfPerjury,
    422,
    'good_faith_misidentification_under_penalty_of_perjury must be accepted',
  )
  assert(input.electronicSignature.trim(), 422, 'electronic_signature is required')
  return createAuthenticatedCopyrightSubmission(
    currentUser,
    noticeId,
    idempotencyKey,
    'counter_notice',
    input,
  )
}

async function createAuthenticatedCopyrightSubmission(
  currentUser: PrivateUser,
  noticeId: string,
  idempotencyKey: string,
  kind: 'appeal' | 'counter_notice',
  input: CopyrightAppealInput | CopyrightCounterNoticeInput,
): Promise<{ submission: CopyrightNoticeSubmissionRecord; isDuplicate: boolean }> {
  assert(input.targetIds.length > 0, 422, 'At least one target is required')
  assert(new Set(input.targetIds).size === input.targetIds.length, 422, 'Targets must be unique')
  const requestSha256 = createHash('sha256').update(JSON.stringify({ kind, input })).digest()
  await using transaction = await beginTransaction()
  await transaction(sql`/* createCopyrightSubmission:idempotencyLock */
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`copyright-submission:${currentUser.id}:${idempotencyKey}`}, 0)
    )
  `)
  const { rows: existingRows } = await transaction<
    CopyrightNoticeSubmissionRecord & {
      request_sha256: Buffer
    }
  >(sql`/* createCopyrightSubmission:existing */
    SELECT submission.id, submission.copyright_notice_id, submission.kind, submission.received_at,
      submission.source_kind, submission.submitted_by_user_id, submission.body_ciphertext,
      request.request_sha256
    FROM copyright_notice_submission_requests request
    JOIN copyright_notice_submissions submission ON submission.id = request.copyright_notice_submission_id
    WHERE request.requester_user_id = ${currentUser.id} AND request.idempotency_key = ${idempotencyKey}
    FOR UPDATE OF request
  `)
  const existing = existingRows[0]
  if (existing) {
    assert(
      existing.request_sha256.equals(requestSha256),
      409,
      'Idempotency-Key was reused for a different request',
    )
    await transaction.commit()
    return { submission: existing, isDuplicate: true }
  }
  const { rows: ownedTargetRows } = await transaction<{
    id: string
  }>(sql`/* createCopyrightSubmission:posterTargets */
    SELECT target.id
    FROM copyright_notice_targets target
    JOIN copyright_notice_target_images image_target ON image_target.copyright_notice_target_id = target.id
    JOIN post_images post_image ON post_image.image_id = image_target.image_id
    JOIN posts post ON post.id = post_image.post_id
    WHERE target.copyright_notice_id = ${noticeId} AND target.id = ANY(${input.targetIds})
      AND target.placement_key = concat('post-image:', post_image.post_id, ':', image_target.image_id)
      AND post.created_by_id = ${currentUser.id} AND post.deleted_at IS NULL
    FOR UPDATE OF target
  `)
  assert(
    ownedTargetRows.length === input.targetIds.length,
    403,
    'You may only submit for your affected hosted material',
  )
  const purpose = `copyright-submission:${noticeId}:${idempotencyKey}`
  const now = new Date()
  const { rows } =
    await transaction<CopyrightNoticeSubmissionRecord>(sql`/* createCopyrightSubmission */
    INSERT INTO copyright_notice_submissions (
      copyright_notice_id, kind, received_at, source_kind, submitted_by_user_id, body_ciphertext
    ) VALUES (${noticeId}, ${kind}, ${now}, 'signed_in_form', ${currentUser.id},
      ${encryptSecret(JSON.stringify(input), purpose)})
    RETURNING id, copyright_notice_id, kind, received_at, source_kind, submitted_by_user_id, body_ciphertext
  `)
  const submission = rows[0]
  assert(submission, 500, 'Copyright submission was not created')
  await transaction(sql`/* createCopyrightSubmission:scopeAndReceipt */
    WITH inserted_targets AS (
      INSERT INTO copyright_notice_submission_targets (
        copyright_notice_submission_id, copyright_notice_target_id
      )
      SELECT ${submission.id}, target.id FROM copyright_notice_targets target
      WHERE target.copyright_notice_id = ${noticeId} AND target.id = ANY(${input.targetIds})
    ), inserted_request AS (
      INSERT INTO copyright_notice_submission_requests (
        copyright_notice_submission_id, requester_user_id, idempotency_key, request_sha256
      ) VALUES (${submission.id}, ${currentUser.id}, ${idempotencyKey}, ${requestSha256})
    )
    INSERT INTO copyright_notice_lifecycle_events (
      copyright_notice_id, event_type, actor_user_id, metadata
    ) VALUES (${noticeId}, ${`${kind}_received`}, ${currentUser.id}, '{}'::jsonb)
  `)
  await transaction.commit()
  return { submission, isDuplicate: false }
}
