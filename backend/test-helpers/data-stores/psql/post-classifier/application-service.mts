import { read, write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type PostClassifierApplicationFacts = {
  id: string
  input_sha256: Buffer
  configuration_sha256: Buffer
  reserved_batch_id: string | null
  committed_batch_id: string | null
  provider_attempts_started: number
  terminal_remote_failed_at: Date | null
  superseded_at: Date | null
  lease_token: string | null
  outcomes_persisted_at: Date | null
  votes_applied_at: Date | null
  tags_applied_at: Date | null
  completed_at: Date | null
  local_flagged: boolean | null
}

export async function setPostClassifierPostHashForTest(
  postId: string,
  hash: Buffer,
): Promise<void> {
  await write(sql`/* setPostClassifierPostHashForTest */
    UPDATE posts SET llm_moderation_content_sha256 = ${hash} WHERE id = ${postId}
  `)
}

export async function expirePostClassifierLeaseForTest(
  postId: string,
  applicationId: string,
): Promise<void> {
  await write(sql`/* expirePostClassifierLeaseForTest */
    UPDATE post_classifier_applications
    SET leased_at = clock_timestamp() - INTERVAL '2 minutes',
      lease_expires_at = clock_timestamp() - INTERVAL '1 second'
    WHERE post_id = ${postId} AND id = ${applicationId}
  `)
}

export async function getPostClassifierApplicationFacts(
  postId: string,
  query: QueryExecutor = read,
): Promise<PostClassifierApplicationFacts[]> {
  const { rows } = await query<PostClassifierApplicationFacts>(sql`
    /* getPostClassifierApplicationFacts */
    SELECT id, input_sha256, configuration_sha256, reserved_batch_id, committed_batch_id,
    provider_attempts_started, terminal_remote_failed_at, superseded_at, lease_token,
      outcomes_persisted_at, votes_applied_at, tags_applied_at, completed_at, local_flagged
    FROM post_classifier_applications WHERE post_id = ${postId} ORDER BY id
  `)
  return rows
}
