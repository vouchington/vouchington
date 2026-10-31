import { createHash } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function seedCopyrightSubmissionKeyExpiry(input: {
  id: string
  submissionId: string
  requesterId: string
  key: string
}): Promise<void> {
  const digest = createHash('sha256').update(input.key.toLowerCase()).digest()
  await write(sql`/* seedCopyrightSubmissionKeyExpiry */
    INSERT INTO copyright_notice_submission_requests
      (id, copyright_notice_submission_id, requester_user_id, idempotency_key,
        idempotency_key_sha256, request_sha256)
    VALUES (${input.id}, ${input.submissionId}, ${input.requesterId}, ${input.key},
      ${digest}, ${Buffer.alloc(32, 7)})`)
}

export async function readCopyrightSubmissionKeyExpiry(id: string): Promise<{
  idempotency_key: string | null
  idempotency_key_sha256: Buffer
}> {
  const result = await read<{ idempotency_key: string | null; idempotency_key_sha256: Buffer }>(
    sql`/* readCopyrightSubmissionKeyExpiry */
    SELECT idempotency_key, idempotency_key_sha256
    FROM copyright_notice_submission_requests WHERE id = ${id}`,
  )
  if (!result.rows[0]) throw new Error('Submission request fixture disappeared')
  return result.rows[0]
}
