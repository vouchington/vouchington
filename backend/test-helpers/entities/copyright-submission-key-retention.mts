import { CopyrightReplayAdmission } from '../../services/copyright-notices/replay-admission.mts'
import { recordCopyrightReplayIdentity } from '../../services/copyright-notices/replay-identity-create.mts'
import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function seedCopyrightSubmissionRequestKey(input: {
  id: string
  submissionId: string
  requesterUserId: string | null
  idempotencyKey: string
  requestSha256: Buffer
}): Promise<void> {
  await write(sql`/* seedCopyrightSubmissionRequestKey */
    INSERT INTO copyright_notice_submission_requests
      (id, copyright_notice_submission_id, requester_user_id, idempotency_key, request_sha256)
    VALUES (${input.id}, ${input.submissionId}, ${input.requesterUserId},
      ${input.idempotencyKey}, ${input.requestSha256})`)
}

export async function retainCopyrightSubmissionReplay(input: {
  requesterUserId: string
  idempotencyKey: string
  requestSha256: Buffer
  submissionId: string
  receivedAt: Date
}): Promise<Buffer> {
  await using query = await beginTransaction()
  const { rows } = await query<{ copyright_notice_id: string }>(sql`/* findRawKeyReplayOwner */
    SELECT copyright_notice_id FROM copyright_notice_submissions WHERE id = ${input.submissionId}`)
  const noticeId = rows[0]?.copyright_notice_id
  if (!noticeId) throw new Error('Submission replay fixture has no notice')
  const admission = await CopyrightReplayAdmission.open(query, {
    family: 'submission',
    jurisdiction: 'us_dmca',
    identity: JSON.stringify([input.requesterUserId, input.idempotencyKey]),
    requester: input.requesterUserId,
    request: input.requestSha256.toString('hex'),
  })
  const id = await recordCopyrightReplayIdentity(admission, noticeId, 'submission_received', {
    id: input.submissionId,
    received_at: input.receivedAt.toISOString(),
  })
  await query.commit()
  return Buffer.from(id)
}

export async function attemptDirectCopyrightKeyMutation(id: string): Promise<void> {
  await write(sql`/* rejectDirectCopyrightKeyMutation */
    UPDATE copyright_notice_submission_requests SET idempotency_key = NULL
    WHERE id = ${id}`)
}

export async function attemptYoungCopyrightKeyMutation(id: string): Promise<void> {
  await using query = await beginTransaction()
  await query(sql`/* permitOnlyOldCopyrightKeyRetention */
    SET LOCAL app.copyright_submission_key_retention = 'on'`)
  await query(sql`/* rejectYoungCopyrightKeyMutation */
    UPDATE copyright_notice_submission_requests SET idempotency_key = NULL
    WHERE id = ${id}`)
}

export async function readCopyrightSubmissionRequestKeys(
  ids: readonly string[],
): Promise<{ id: string; idempotency_key: string | null }[]> {
  const { rows } = await read<{ id: string; idempotency_key: string | null }>(sql`
    /* readCopyrightSubmissionKeysAfterCleanup */
    SELECT id, idempotency_key FROM copyright_notice_submission_requests
    WHERE id = ANY(${ids}::uuid[])`)
  return rows
}

export async function hasCopyrightSubmissionReplayIdentity(identityId: Buffer): Promise<boolean> {
  const { rows } = await read(sql`/* assertCopyrightReplayIdentitySurvivesRawKeyCleanup */
    SELECT 1 FROM copyright_replay_identities WHERE id = ${identityId.toString()}::uuid`)
  return rows.length === 1
}
