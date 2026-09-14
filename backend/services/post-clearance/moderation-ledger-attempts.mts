import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import {
  type AutomatedPostModerationSource,
  type PostModerationDisposition,
} from './moderation-ledger-types.mts'
import {
  ensureCurrentPostModerationVersion,
  recordPostModerationDisposition,
} from './moderation-ledger-versions.mts'

export type PostModerationAttempt = {
  id: string
  version_id: string
  post_id: string
  source: AutomatedPostModerationSource
  attempt_number: number
  lease_token: string
  deadline_at: Date
  content_sha256: Buffer
}

export async function beginPostModerationAttempt(
  postId: string,
  source: AutomatedPostModerationSource,
): Promise<PostModerationAttempt | null> {
  await using transaction = await beginTransaction()
  const version = await ensureCurrentPostModerationVersion(postId, { query: transaction })
  const { rows } = await transaction<PostModerationAttempt>(
    `/* beginPostModerationAttempt */
      WITH claimed_work AS (
        UPDATE post_moderation_work_items work
        SET leased_at = CURRENT_TIMESTAMP,
          lease_token = uuidv7(),
          lease_expires_at = LEAST($3, CURRENT_TIMESTAMP + INTERVAL '4 minutes'),
          generation = generation + 1
        WHERE work.version_id = $1
          AND work.source = $2::post_moderation_sources
          AND work.completed_at IS NULL
          AND work.available_at <= CURRENT_TIMESTAMP
          AND (work.lease_expires_at IS NULL OR work.lease_expires_at <= CURRENT_TIMESTAMP)
          AND CURRENT_TIMESTAMP < $3
          AND (
            SELECT count(*)
            FROM post_moderation_attempts attempt
            WHERE attempt.version_id = work.version_id
              AND attempt.source = work.source
          ) < 3
        RETURNING work.version_id, work.source, work.lease_token
      ),
      inserted_attempt AS (
        INSERT INTO post_moderation_attempts (
          version_id, source, attempt_number, lease_token
        )
        SELECT claimed_work.version_id, claimed_work.source,
          1 + (
            SELECT count(*)
            FROM post_moderation_attempts prior
            WHERE prior.version_id = claimed_work.version_id
              AND prior.source = claimed_work.source
          ),
          claimed_work.lease_token
        FROM claimed_work
        RETURNING *
      )
      SELECT attempt.id, attempt.version_id, version.post_id, attempt.source,
        attempt.attempt_number, attempt.lease_token, version.deadline_at, version.content_sha256
      FROM inserted_attempt attempt
      JOIN post_moderation_versions version ON version.id = attempt.version_id`,
    [version.id, source, version.deadline_at],
  )
  await transaction.commit()
  return rows[0] ?? null
}

export async function completePostModerationAttempt(
  attempt: PostModerationAttempt,
  result: {
    disposition: Exclude<PostModerationDisposition, 'incomplete'>
    reasonCode: string
    evidence?: Readonly<Record<string, unknown>>
  },
): Promise<boolean> {
  await using transaction = await beginTransaction()
  const fenced = await completeAttemptRow(transaction, attempt)
  if (!fenced) return false
  const recorded = await recordPostModerationDisposition(
    {
      versionId: attempt.version_id,
      source: attempt.source,
      attemptId: attempt.id,
      disposition: result.disposition,
      reasonCode: result.reasonCode,
      evidence: result.evidence,
    },
    { query: transaction },
  )
  await transaction.commit()
  return recorded
}

export async function failPostModerationAttempt(
  attempt: PostModerationAttempt,
  errorCode: string,
): Promise<{ recorded: boolean; exhausted: boolean }> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ exhausted: boolean }>(
    `/* failPostModerationAttempt */
      WITH failed_attempt AS (
        UPDATE post_moderation_attempts attempt_row
        SET failed_at = CURRENT_TIMESTAMP,
          error_code = $5
        FROM post_moderation_work_items work
        WHERE attempt_row.id = $1
          AND attempt_row.version_id = $2
          AND attempt_row.source = $3::post_moderation_sources
          AND attempt_row.lease_token = $4
          AND attempt_row.completed_at IS NULL
          AND attempt_row.failed_at IS NULL
          AND work.version_id = attempt_row.version_id
          AND work.source = attempt_row.source
          AND work.lease_token = attempt_row.lease_token
        RETURNING attempt_row.version_id, attempt_row.source, attempt_row.attempt_number
      ),
      released_work AS (
        UPDATE post_moderation_work_items work
        SET available_at = CASE failed_attempt.attempt_number
              WHEN 1 THEN version.created_at + INTERVAL '5 minutes'
              ELSE version.created_at + INTERVAL '20 minutes'
            END,
          completed_at = CASE WHEN failed_attempt.attempt_number >= 3
            THEN CURRENT_TIMESTAMP ELSE NULL END,
          leased_at = NULL,
          lease_token = NULL,
          lease_expires_at = NULL
        FROM failed_attempt
        JOIN post_moderation_versions version ON version.id = failed_attempt.version_id
        WHERE work.version_id = failed_attempt.version_id
          AND work.source = failed_attempt.source
        RETURNING work.version_id, work.source, work.completed_at IS NOT NULL AS exhausted
      ),
      inserted_disposition AS (
        INSERT INTO post_moderation_dispositions (
          version_id, source, attempt_id, disposition, reason_code, evidence
        )
        SELECT released_work.version_id, released_work.source, $1,
          'incomplete'::post_moderation_disposition_types, 'automation_unavailable',
          jsonb_build_object('error_code', $5)
        FROM released_work
        WHERE released_work.exhausted
        ON CONFLICT (attempt_id) DO NOTHING
      )
      SELECT exhausted FROM released_work`,
    [attempt.id, attempt.version_id, attempt.source, attempt.lease_token, errorCode],
  )
  await transaction.commit()
  return { recorded: rows.length > 0, exhausted: rows[0]?.exhausted ?? false }
}

async function completeAttemptRow(
  query: TransactionQuery,
  attempt: PostModerationAttempt,
): Promise<boolean> {
  const { rows } = await query(
    `/* completeAttemptRow */
      UPDATE post_moderation_attempts attempt_row
      SET completed_at = CURRENT_TIMESTAMP
      FROM post_moderation_work_items work
      WHERE attempt_row.id = $1
        AND attempt_row.version_id = $2
        AND attempt_row.source = $3::post_moderation_sources
        AND attempt_row.lease_token = $4
        AND attempt_row.completed_at IS NULL
        AND attempt_row.failed_at IS NULL
        AND work.version_id = attempt_row.version_id
        AND work.source = attempt_row.source
        AND work.lease_token = attempt_row.lease_token
        AND work.lease_expires_at > CURRENT_TIMESTAMP
      RETURNING attempt_row.id`,
    [attempt.id, attempt.version_id, attempt.source, attempt.lease_token],
  )
  return rows.length > 0
}
