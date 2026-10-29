import { beginTransaction, write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import onError from '@modules/on-error'
import { enqueueCreatePostModeration } from '@queues/openai-moderation/enqueues'
import { enqueueSpamDetection } from '@queues/moderation-signals/enqueues'
import {
  type AutomatedPostModerationSource,
  AUTOMATED_POST_MODERATION_SOURCES,
  type PostModerationDisposition,
  type PostModerationVersion,
  POST_MODERATION_POLICY_REVISION,
  type PostModerationVersion,
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
  deadline_at: Date
  content_sha256: Buffer
}

export async function beginPostModerationAttempt(
  postId: string,
  source: AutomatedPostModerationSource,
): Promise<PostModerationAttempt | null> {
  const attempt = await loadCommittedPostModerationAttempt(postId, source)
  if (!attempt) return null
  await enqueueCommittedPostModerationAttempt(attempt.version_id, source)
  return attempt
}

/** Commits the current version and both automated attempts, then enqueues one job per source. */
export async function admitAutomatedPostModeration(postId: string): Promise<void> {
  const version = await commitCurrentPostModerationVersion(postId)
  await Promise.all(
    AUTOMATED_POST_MODERATION_SOURCES.map(source =>
      enqueueCommittedPostModerationAttempt(version.id, source),
    ),
  )
}

/** Re-enqueues a committed version. The sweep uses this after a lost enqueue; failures retry the sweep. */
export function enqueuePostModerationRecovery(
  versionId: string,
  source: AutomatedPostModerationSource,
): Promise<unknown> {
  if (source === 'openai_omni') return enqueueCreatePostModeration(versionId)
  return enqueueSpamDetection(versionId)
}

/**
 * Primary read for a job start. Returns nothing when the version is gone, no longer current,
 * or that source already has a disposition, so the provider is not called again.
 */
export async function readCurrentAutomatedPostModerationAttempt(
  versionId: string,
  source: AutomatedPostModerationSource,
): Promise<PostModerationAttempt | null> {
  const { rows } = await write<PostModerationAttempt>(
    `/* readCurrentAutomatedPostModerationAttempt */
      SELECT attempt.id, attempt.version_id, version.post_id, attempt.source,
        attempt.attempt_number, version.deadline_at, version.content_sha256
      FROM post_moderation_attempts attempt
      JOIN post_moderation_versions version ON version.id = attempt.version_id
      JOIN posts post ON post.id = version.post_id
        AND post.deleted_at IS NULL
        AND post.llm_moderation_content_sha256 = version.content_sha256
      WHERE attempt.version_id = $1
        AND attempt.source = $2::post_moderation_sources
        AND version.policy_revision = $3
        AND NOT EXISTS (
          SELECT 1 FROM post_moderation_dispositions disposition
          WHERE disposition.version_id = attempt.version_id
            AND disposition.source = attempt.source
        )`,
    [versionId, source, POST_MODERATION_POLICY_REVISION],
  )
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
  const recorded = await completeAndRecord(transaction, attempt, result)
  if (!recorded) return false
  await transaction.commit()
  return true
}

async function loadCommittedPostModerationAttempt(
  postId: string,
  source: AutomatedPostModerationSource,
): Promise<PostModerationAttempt | null> {
  const version = await commitCurrentPostModerationVersion(postId)
  return readCurrentAutomatedPostModerationAttempt(version.id, source)
}

async function commitCurrentPostModerationVersion(postId: string): Promise<PostModerationVersion> {
  await using transaction = await beginTransaction()
  const version = await ensureCurrentPostModerationVersion(postId, { query: transaction })
  await transaction.commit()
  return version
}

async function completeAndRecord(
  transaction: TransactionQuery,
  attempt: PostModerationAttempt,
  result: {
    disposition: Exclude<PostModerationDisposition, 'incomplete'>
    reasonCode: string
    evidence?: Readonly<Record<string, unknown>>
  },
): Promise<boolean> {
  const completed = await completeAttemptRow(transaction, attempt)
  if (!completed) return false
  return recordPostModerationDisposition(
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
}

async function completeAttemptRow(
  query: TransactionQuery,
  attempt: PostModerationAttempt,
): Promise<boolean> {
  const { rows } = await query<{ id: string }>(
    `/* completeAttemptRow */
      UPDATE post_moderation_attempts attempt_row
      SET completed_at = CURRENT_TIMESTAMP
      WHERE attempt_row.id = $1
        AND attempt_row.version_id = $2
        AND attempt_row.source = $3::post_moderation_sources
        AND attempt_row.completed_at IS NULL
      RETURNING attempt_row.id`,
    [attempt.id, attempt.version_id, attempt.source],
  )
  return rows.length > 0
}

async function enqueueCommittedPostModerationAttempt(
  versionId: string,
  source: AutomatedPostModerationSource,
): Promise<void> {
  try {
    await enqueuePostModerationRecovery(versionId, source)
  } catch (err) {
    onError(
      err instanceof Error ? err : new Error('Post moderation enqueue failed', { cause: err }),
    )
  }
}
