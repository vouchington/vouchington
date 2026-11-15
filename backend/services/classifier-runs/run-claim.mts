import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import {
  classifierRetentionCutoff,
  isClassifierBatchWithinRetention,
} from '@services/classifiers/retention-window'
import { runCapturedCandidateKind } from './remote-plan.mts'
import {
  readClassifierRunCandidateTopicIds,
  readClassifierRunStoryCandidates,
} from './run-candidates.mts'
import { lockClassifierRun, type ClassifierRunTarget } from './run-lock.mts'
import type { ClassifierRunAdapter, ClassifierRunLease } from './types.mts'

export type ClaimClassifierRunInput = ClassifierRunTarget & { leaseSeconds: number }

export type ClaimClassifierRunResult<C> =
  | { kind: 'claimed' | 'outcomes_ready'; lease: ClassifierRunLease<C> }
  | { kind: 'in_progress'; retryAfterSeconds: number }
  | { kind: 'completed' }
  | { kind: 'terminal' }
  | { kind: 'stale' }

/**
 * Takes the exclusive, fenced lease on a reserved run. The run is never created here, so a retry,
 * a replay or a changed candidate set can only reclaim the one receipt of its identity. A
 * superseded run whose identity is current again is revived by the same update that leases it.
 */
export async function claimClassifierRun<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  input: ClaimClassifierRunInput,
): Promise<ClaimClassifierRunResult<C>> {
  if (!Number.isInteger(input.leaseSeconds) || input.leaseSeconds <= 0) {
    throw new Error('classifier run lease duration must be a positive integer')
  }
  if (await isCompletedTarget(adapter.slug, input)) return { kind: 'completed' }
  await using query = await beginTransaction()
  const locked = await lockClassifierRun(adapter, query, input)
  if (!locked) {
    return (await isCompletedTarget(adapter.slug, input))
      ? { kind: 'completed' }
      : { kind: 'stale' }
  }
  const { row, resolved } = locked
  if (row.completed_at) return { kind: 'completed' }
  if (!resolved) throw new Error('incomplete classifier run has no current configuration')
  if (row.terminal_failed_at) return { kind: 'terminal' }
  // A delayed queued claim must not revive a superseded run after its payload or result range retired.
  if (
    row.superseded_at &&
    (row.id < timestampToUuidv7LowerBound(classifierRetentionCutoff().getTime()) ||
      (row.decision_batch_id && !isClassifierBatchWithinRetention(row.decision_batch_id)))
  ) {
    return { kind: 'stale' }
  }
  if (row.lease_is_live) {
    return { kind: 'in_progress', retryAfterSeconds: row.retry_after_seconds ?? 1 }
  }
  const leaseToken = randomUUID()
  await query(sql`/* claimClassifierRun */
    UPDATE classifier_runs
    SET lease_token = ${leaseToken}, leased_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + ${input.leaseSeconds} * INTERVAL '1 second',
      superseded_at = NULL
    WHERE id = ${input.runId}
  `)
  const capturedTopicIds =
    runCapturedCandidateKind(resolved) === 'topic'
      ? await readClassifierRunCandidateTopicIds(query, input.runId)
      : []
  const capturedStoryCandidates =
    resolved.remote?.candidateKind === 'story'
      ? await readClassifierRunStoryCandidates(query, input.runId)
      : []
  await query.commit()
  return {
    kind: row.outcomes_persisted_at ? 'outcomes_ready' : 'claimed',
    lease: {
      runId: input.runId,
      subject: input.subject,
      inputSha256: input.inputSha256,
      resolved,
      leaseToken,
      decisionBatchId: row.decision_batch_id,
      capturedTopicIds,
      capturedStoryCandidates,
    },
  }
}

/** Completion is immutable, so an exact completed target replays even after a later page advances. */
async function isCompletedTarget(slug: string, input: ClaimClassifierRunInput): Promise<boolean> {
  const { rows } = await write(sql`
    /* isCompletedClassifierRunTarget */
    SELECT 1 FROM classifier_runs run
    JOIN classifiers classifier ON classifier.id = run.classifier_id
    WHERE run.id = ${input.runId}
      AND classifier.slug = ${slug}
      AND run.post_id IS NOT DISTINCT FROM ${input.subject.postId}::uuid
      AND run.rss_feed_item_id IS NOT DISTINCT FROM ${input.subject.rssFeedItemId}::uuid
      AND run.input_sha256 = ${input.inputSha256}
      AND run.configuration_sha256 = ${input.configurationSha256}
      AND run.completed_at IS NOT NULL
    LIMIT 1
  `)
  return rows.length > 0
}
