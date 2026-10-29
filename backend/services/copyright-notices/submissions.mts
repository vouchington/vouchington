import { lockCopyrightNoticeLifetime } from './notice-lifetime.mts'
import { CopyrightReplayAdmission } from './replay-admission.mts'
import { findCopyrightReplayIdentity } from './replay-identity-store.mts'
import { recordCopyrightReplayIdentity } from './replay-identity-create.mts'
import {
  assertCopyrightCounterNoticeInput,
  type CopyrightAppealInput,
  type CopyrightCounterNoticeInput,
} from './submission-inputs.mts'
export type { CopyrightAppealInput, CopyrightCounterNoticeInput } from './submission-inputs.mts'
import { openCopyrightSecrets } from './encryption-keys.mts'
import { createHash } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { copyrightPlacementPartiesSql } from '@data-stores/psql/copyright-placement-parties'
import { v7 as uuidv7 } from 'uuid'
import type { PrivateUser } from '@services/users/types'
import type { CopyrightNoticeSubmissionRecord } from './types.mts'
import { createCopyrightDeliveryIntent } from './delivery-intents.mts'
import {
  decodeSubmissionReceiptSnapshot,
  type CopyrightSubmissionReceipt,
} from './submission-retained-receipt.mts'

export async function createCopyrightAppeal(
  currentUser: PrivateUser,
  noticeId: string,
  idempotencyKey: string,
  input: CopyrightAppealInput,
): Promise<{ submission: CopyrightSubmissionReceipt; isDuplicate: boolean }> {
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
): Promise<{ submission: CopyrightSubmissionReceipt; isDuplicate: boolean }> {
  assertCopyrightCounterNoticeInput(input)
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
): Promise<{ submission: CopyrightSubmissionReceipt; isDuplicate: boolean }> {
  assert(input.targetIds.length > 0, 422, 'At least one target is required')
  assert(new Set(input.targetIds).size === input.targetIds.length, 422, 'Targets must be unique')
  const requestSha256 = createHash('sha256').update(JSON.stringify({ kind, input })).digest()
  const replayInput = {
    family: 'submission' as const,
    jurisdiction: 'us_dmca' as const,
    identity: JSON.stringify([currentUser.id, idempotencyKey]),
    requester: currentUser.id,
    request: JSON.stringify({ noticeId, kind, input }),
  }
  await using transaction = await beginTransaction()
  const noticeLifetime = await lockCopyrightNoticeLifetime(transaction, noticeId)
  const { rows: notices } = await transaction<{ jurisdiction: string }>(sql`
    /* createCopyrightSubmission:jurisdiction */
    SELECT jurisdiction FROM copyright_notices WHERE id = ${noticeId} FOR UPDATE
  `)
  const replayAdmission = await CopyrightReplayAdmission.open(
    transaction,
    replayInput,
    noticeLifetime,
  )
  const existing = await findCopyrightReplayIdentity(replayAdmission)
  if (existing) {
    const replay = await existing.replay()
    await transaction.commit()
    assert(replay.liveSnapshot, 404, 'Copyright notice not found')
    return { submission: decodeSubmissionReceiptSnapshot(replay.liveSnapshot), isDuplicate: true }
  }
  assert(notices[0], 404, 'Copyright notice not found')
  assert(notices[0].jurisdiction === 'us_dmca', 422, 'Use the territorial complaint process')
  const ownershipStatement = sql`/* createCopyrightSubmission:posterTargets */
    SELECT target.id
    FROM copyright_notice_targets target
    CROSS JOIN LATERAL `
  ownershipStatement.append(copyrightPlacementPartiesSql('respond'))
  ownershipStatement.append(sql` party
    WHERE target.copyright_notice_id = ${noticeId} AND target.id = ANY(${input.targetIds})
      AND party.user_id = ${currentUser.id}
    ORDER BY target.id
    FOR UPDATE OF target
  `)
  const { rows: ownedTargetRows } = await transaction<{ id: string }>(ownershipStatement)
  assert(
    ownedTargetRows.length === input.targetIds.length,
    403,
    'You may only submit for your affected hosted material',
  )
  await using secrets = await openCopyrightSecrets(
    { kind: 'notice', id: noticeId },
    transaction,
    'write',
  )
  const { encryptSecret } = secrets
  const submissionId = uuidv7()
  const purpose = copyrightSubmissionPurpose(submissionId)
  const now = new Date()
  const { rows } =
    await transaction<CopyrightNoticeSubmissionRecord>(sql`/* createCopyrightSubmission */
    INSERT INTO copyright_notice_submissions (
      id, copyright_notice_id, kind, received_at, source_kind, submitted_by_id, body_ciphertext
    ) VALUES (${submissionId}, ${noticeId}, ${kind}, ${now}, 'signed_in_form', ${currentUser.id},
      ${encryptSecret(JSON.stringify(input), purpose)})
    RETURNING id, copyright_notice_id, kind, received_at, source_kind, submitted_by_id, body_ciphertext
  `)
  const submission = rows[0]
  assert(submission, 500, 'Copyright submission was not created')
  // ast-grep-ignore: no-three-sequential-awaits -- target/request/lifecycle facts must exist before the delivery intent, and the exact-replay identity follows the receipt obligation in this transaction.
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
    INSERT INTO copyright_notice_lifecycle_changes (
      copyright_notice_id, change_type, changed_by_id, copyright_notice_submission_id
    ) VALUES (${noticeId}, ${`${kind}_received`}, ${currentUser.id}, ${submission.id})
  `)
  await createCopyrightDeliveryIntent(
    {
      noticeId,
      submissionId: submission.id,
      correspondenceId: null,
      recipientUserId: currentUser.id,
      recipientRole: 'poster',
      deliveryKind: 'status_update',
      channel: 'in_app',
      idempotencyKey: `copyright-submission:${submission.id}:poster-receipt`,
    },
    transaction,
  )
  await recordCopyrightReplayIdentity(replayAdmission, noticeId, 'submission_received', {
    id: submission.id,
    received_at: submission.received_at,
  })
  await transaction.commit()
  return {
    submission: { id: submission.id, received_at: submission.received_at },
    isDuplicate: false,
  }
}

export function copyrightSubmissionPurpose(submissionId: string): string {
  return `copyright-submission:${submissionId}`
}
