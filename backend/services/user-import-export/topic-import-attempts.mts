import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { IDEMPOTENCY_KEY_REUSED } from '@modules/on-error/error-codes'
import { hashAdmissionIntent } from '@services/contribution-gating/admission'
import sql from 'sql-template-strings'
import type { ImportTopicResult } from './import-topics.mts'

const TOPIC_IMPORT_REPLAY_RETENTION_HOURS = 48

type TopicImportAttemptRow = {
  id: string
  intent_sha256: string
  response: ImportTopicResult[] | null
  expired: boolean
}

export type TopicImportAttempt = Readonly<{
  id: string
  response?: ImportTopicResult[]
}>

/** Binds an actor-owned request key to one ordered topic-import batch. */
export async function claimTopicImportAttempt(
  userId: string,
  idempotencyKey: string,
  names: readonly string[],
): Promise<TopicImportAttempt> {
  const intentSha256 = topicImportIntentSha256(names)
  await using query = await beginTransaction()
  const result = await claimTopicImportAttemptInTransaction(
    query,
    userId,
    idempotencyKey,
    intentSha256,
  )
  await query.commit()
  return result
}

async function claimTopicImportAttemptInTransaction(
  query: TransactionQuery,
  userId: string,
  idempotencyKey: string,
  intentSha256: string,
): Promise<TopicImportAttempt> {
  await query(sql`/* claimTopicImportAttempt.insert */
      INSERT INTO user_topic_import_attempts (
        user_id, idempotency_key, intent_sha256, retention_expires_at
      ) VALUES (
        ${userId}, ${idempotencyKey}, ${intentSha256},
        NOW() + ${TOPIC_IMPORT_REPLAY_RETENTION_HOURS} * INTERVAL '1 hour'
      )
      ON CONFLICT (user_id, idempotency_key) DO NOTHING`)
  const result = await query<TopicImportAttemptRow>(sql`/* claimTopicImportAttempt.get */
      SELECT id, intent_sha256, response,
        retention_expires_at <= clock_timestamp() AS expired
      FROM user_topic_import_attempts
      WHERE user_id = ${userId} AND idempotency_key = ${idempotencyKey}
      FOR UPDATE`)
  const row = result.rows[0]
  if (!row) throw new Error('Topic import attempt was not returned')
  if (row.expired) {
    await query(sql`/* claimTopicImportAttempt.deleteExpired */
        DELETE FROM user_topic_import_attempts WHERE id = ${row.id}`)
    const replacement = await query<{ id: string }>(sql`/* claimTopicImportAttempt.replace */
        INSERT INTO user_topic_import_attempts (
          user_id, idempotency_key, intent_sha256, retention_expires_at
        ) VALUES (
          ${userId}, ${idempotencyKey}, ${intentSha256},
          NOW() + ${TOPIC_IMPORT_REPLAY_RETENTION_HOURS} * INTERVAL '1 hour'
        )
        RETURNING id`)
    const replacementId = replacement.rows[0]?.id
    if (!replacementId) throw new Error('Replacement topic import attempt was not returned')
    return { id: replacementId }
  }
  if (row.intent_sha256 !== intentSha256) {
    throw createCodedError(
      409,
      'This Idempotency-Key was already used for a different request.',
      IDEMPOTENCY_KEY_REUSED,
    )
  }
  if (row.response === null) return { id: row.id }
  await query(sql`/* claimTopicImportAttempt.extendReplay */
      UPDATE user_topic_import_attempts
      SET retention_expires_at = clock_timestamp()
        + ${TOPIC_IMPORT_REPLAY_RETENTION_HOURS} * INTERVAL '1 hour'
      WHERE id = ${row.id}`)
  return { id: row.id, response: row.response }
}

/** Opens the writer transaction that serializes and publishes one exact import response. */
export async function finalizeTopicImportAttempt(
  attemptId: string,
  buildResponse: (query: TransactionQuery) => Promise<ImportTopicResult[]>,
): Promise<ImportTopicResult[]> {
  await using query = await beginTransaction()
  const result = await completeTopicImportAttempt(query, attemptId, () => buildResponse(query))
  await query.commit()
  return result
}

async function completeTopicImportAttempt(
  query: TransactionQuery,
  attemptId: string,
  buildResponse: () => Promise<ImportTopicResult[]>,
): Promise<ImportTopicResult[]> {
  const locked = await query<{
    response: ImportTopicResult[] | null
  }>(sql`/* completeTopicImportAttempt.lock */
    SELECT response
    FROM user_topic_import_attempts
    WHERE id = ${attemptId}
    FOR UPDATE`)
  const storedResponse = locked.rows[0]?.response
  if (storedResponse !== null && storedResponse !== undefined) return storedResponse
  if (locked.rowCount !== 1) throw new Error('Topic import attempt was not found during completion')

  const response = await buildResponse()
  const completed = await query<{
    response: ImportTopicResult[]
  }>(sql`/* completeTopicImportAttempt.complete */
    UPDATE user_topic_import_attempts
    SET response = ${JSON.stringify(response)}::jsonb,
      completed_at = clock_timestamp(),
      retention_expires_at = clock_timestamp()
        + ${TOPIC_IMPORT_REPLAY_RETENTION_HOURS} * INTERVAL '1 hour'
    WHERE id = ${attemptId}
    RETURNING response`)
  const completedResponse = completed.rows[0]?.response
  if (!completedResponse) throw new Error('Completed topic import response was not returned')
  return completedResponse
}

function topicImportIntentSha256(names: readonly string[]): string {
  return hashAdmissionIntent({ route: 'my.import.topics', names })
}

/** Deletes one bounded, lock-safe page of completed replays or abandoned pending attempts. */
export async function pruneExpiredTopicImportAttempts(
  now?: Date,
  batchSize = 100,
  lowerBoundDate?: Date,
): Promise<number> {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('batchSize must be positive')
  await using query = await beginTransaction()
  const result = await query(sql`/* pruneExpiredTopicImportAttempts */
      WITH expired AS (
        SELECT attempt.id
        FROM user_topic_import_attempts attempt
        WHERE attempt.retention_expires_at <= COALESCE(${now ?? null}::timestamptz, NOW())
          AND (${lowerBoundDate ?? null}::timestamptz IS NULL
            OR attempt.retention_expires_at >= ${lowerBoundDate ?? null}::timestamptz)
        ORDER BY attempt.retention_expires_at, attempt.id
        LIMIT ${batchSize}
        FOR UPDATE OF attempt SKIP LOCKED
      )
      DELETE FROM user_topic_import_attempts
      WHERE id = ANY(ARRAY(SELECT id FROM expired))
      RETURNING id`)
  await query.commit()
  return result.rowCount ?? 0
}
