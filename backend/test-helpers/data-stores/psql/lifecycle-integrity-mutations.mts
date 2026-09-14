import { randomBytes, randomUUID } from 'node:crypto'

import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function insertContradictoryImageLifecycle(userId: string): Promise<void> {
  await write(sql`/* rejectContradictoryImageLifecycle */
    INSERT INTO images (
      created_by_id, data, sha_256, s3_key, upload_started_at,
      upload_completed_at, upload_failed_at, upload_error
    ) VALUES (
      ${userId}, '{}'::jsonb, ${randomBytes(32)}, ${`test/${randomUUID()}`},
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'failed'
    )`)
}

export async function insertContradictoryDataRequestLifecycle(): Promise<void> {
  await write(sql`/* rejectContradictoryDataRequestLifecycle */
    INSERT INTO user_data_requests (completed_at)
    VALUES (CURRENT_TIMESTAMP)`)
}

export async function insertContradictoryBedrockBatchLifecycle(): Promise<void> {
  await write(sql`/* rejectContradictoryBedrockBatchLifecycle */
    INSERT INTO bedrock_embeddings_batches (
      id, model_id, job_type, completed_at, failed_at
    ) VALUES (
      ${`lifecycle-${randomUUID()}`}, 'test-model', 'topics',
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )`)
}

export async function insertContradictoryRssImportRowLifecycle(userId: string): Promise<void> {
  const { rows } = await write<{ id: string }>(sql`
    INSERT INTO user_rss_feed_import_batches (user_id, total_rows)
    VALUES (${userId}, 1)
    RETURNING id
  `)
  await write(sql`/* rejectContradictoryRssImportRowLifecycle */
    INSERT INTO user_rss_feed_import_rows (
      batch_id, row_index, input_url, outcome, completed_at, error_message
    ) VALUES (
      ${rows[0]!.id}, 0, 'https://example.com/feed.xml', 'error',
      CURRENT_TIMESTAMP, 'failed'
    )`)
}

export async function insertTerminalBlueskyAuthorizationHandle(userId: string): Promise<void> {
  await write(sql`/* rejectTerminalBlueskyAuthorizationHandle */
    INSERT INTO bluesky_link_authorizations (
      user_id, handle, callback_mode, status, expires_at
    ) VALUES (
      ${userId}, 'retained-handle.bsky.social', 'web', 'rejected', CURRENT_TIMESTAMP
    )`)
}

export async function insertActiveBlueskyAuthorizationWithoutHandle(userId: string): Promise<void> {
  await write(sql`/* rejectActiveBlueskyAuthorizationWithoutHandle */
    INSERT INTO bluesky_link_authorizations (
      user_id, handle, callback_mode, status, expires_at
    ) VALUES (${userId}, NULL, 'web', 'pending', CURRENT_TIMESTAMP)`)
}

export async function rewriteTerminalAgentResponse(userId: string): Promise<void> {
  const { rows } = await write<{ id: string }>(sql`
    INSERT INTO agent_responses (created_by_id, agent, completed_at)
    VALUES (${userId}, 'research', CURRENT_TIMESTAMP)
    RETURNING id
  `)
  await write(sql`/* rejectTerminalAgentResponseRewrite */
    UPDATE agent_responses
    SET completed_at = NULL, failed_at = CURRENT_TIMESTAMP
    WHERE id = ${rows[0]!.id}`)
}

export async function rewriteTerminalImage(userId: string): Promise<void> {
  const { rows } = await write<{ id: string }>(sql`
    INSERT INTO images (
      created_by_id, data, sha_256, s3_key, upload_started_at, upload_completed_at
    ) VALUES (
      ${userId}, '{}'::jsonb, ${randomBytes(32)}, ${`test/${randomUUID()}`},
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    RETURNING id
  `)
  await write(sql`/* rejectTerminalImageRewrite */
    UPDATE images
    SET upload_completed_at = NULL,
        upload_failed_at = CURRENT_TIMESTAMP,
        upload_error = 'failed'
    WHERE id = ${rows[0]!.id}`)
}

export async function rewriteTerminalDataRequest(): Promise<void> {
  const { rows } = await write<{ id: string }>(sql`
    INSERT INTO user_data_requests (processing_started_at, completed_at)
    VALUES (CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id
  `)
  await write(sql`/* rejectTerminalDataRequestRewrite */
    UPDATE user_data_requests
    SET completed_at = NULL, failed_at = CURRENT_TIMESTAMP
    WHERE id = ${rows[0]!.id}`)
}

export async function rewriteTerminalBedrockBatch(): Promise<void> {
  const id = `lifecycle-${randomUUID()}`
  await write(sql`
    INSERT INTO bedrock_embeddings_batches (
      id, model_id, job_type, submitted_at, completed_at
    ) VALUES (
      ${id}, 'test-model', 'topics', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `)
  await write(sql`/* rejectTerminalBedrockBatchRewrite */
    UPDATE bedrock_embeddings_batches
    SET completed_at = NULL, failed_at = CURRENT_TIMESTAMP
    WHERE id = ${id}`)
}

export async function rewriteTerminalRssImportBatch(userId: string): Promise<void> {
  const { rows } = await write<{ id: string }>(sql`
    INSERT INTO user_rss_feed_import_batches (
      user_id, total_rows, completed_rows, completed_at
    ) VALUES (${userId}, 1, 1, CURRENT_TIMESTAMP)
    RETURNING id
  `)
  await write(sql`/* rejectTerminalRssImportBatchRewrite */
    UPDATE user_rss_feed_import_batches
    SET completed_at = NULL
    WHERE id = ${rows[0]!.id}`)
}
