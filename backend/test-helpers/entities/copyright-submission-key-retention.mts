import { createHash } from 'node:crypto'
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
  const identityHash = createHash('sha256').update(input.requesterUserId).digest()
  await write(sql`/* retainOldCopyrightSubmissionReplay */
    INSERT INTO copyright_notice_submission_retained_identities
      (requester_identity_sha256, idempotency_key, request_sha256, response_snapshot)
    VALUES (${identityHash}, ${input.idempotencyKey}, ${input.requestSha256},
      jsonb_build_object('id', ${input.submissionId}::text,
        'received_at', ${input.receivedAt.toISOString()}::text))`)
  return identityHash
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

export async function hasCopyrightSubmissionReplayIdentity(
  identityHash: Buffer,
  idempotencyKey: string,
): Promise<boolean> {
  const { rows } = await read(sql`/* assertCopyrightReplayIdentitySurvivesRawKeyCleanup */
    SELECT 1 FROM copyright_notice_submission_retained_identities
    WHERE requester_identity_sha256 = ${identityHash} AND idempotency_key = ${idempotencyKey}`)
  return rows.length === 1
}
