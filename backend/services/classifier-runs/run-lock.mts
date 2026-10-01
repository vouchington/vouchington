import type { OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  ClassifierRunAdapter,
  ClassifierRunLease,
  ClassifierRunSubject,
  ResolvedClassifierRun,
} from './types.mts'

export type ClassifierRunRow = {
  id: string
  classifier_slug: string
  post_id: string | null
  rss_feed_item_id: string | null
  input_sha256: Buffer
  configuration_json: string
  configuration_sha256: Buffer
  shared_actor_id: string
  decision_batch_id: string | null
  provider_attempts_started: number
  terminal_failed_at: Date | null
  superseded_at: Date | null
  lease_token: string | null
  lease_is_live: boolean
  retry_after_seconds: number | null
  outcomes_persisted_at: Date | null
  completed_at: Date | null
}

/** The identity a job or lease presents; every field is re-checked against the durable run. */
export type ClassifierRunTarget = {
  runId: string
  subject: ClassifierRunSubject
  inputSha256: Buffer
  configurationSha256: Buffer
}

export type LockedClassifierRun<C> = { row: ClassifierRunRow; resolved: ResolvedClassifierRun<C> }

/**
 * Locks the subject, the run and the classifier actor in that order, then re-resolves the
 * configuration. Null means the run no longer matches current content or configuration and must
 * not produce effects; a mismatch between the durable run and its target is a defect and throws.
 */
export async function lockClassifierRun<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  query: OwnedTransaction,
  target: ClassifierRunTarget,
): Promise<LockedClassifierRun<C> | null> {
  const current = await adapter.lockCurrent(query, target.subject)
  if (!current?.inputSha256.equals(target.inputSha256)) return null
  const { rows } = await query<ClassifierRunRow>(sql`/* lockClassifierRun */
    SELECT run.id, classifier.slug AS classifier_slug, run.post_id, run.rss_feed_item_id,
      run.input_sha256, run.configuration_json::text AS configuration_json,
      run.configuration_sha256, run.shared_actor_id, run.decision_batch_id,
      run.provider_attempts_started, run.terminal_failed_at, run.superseded_at, run.lease_token,
      run.outcomes_persisted_at, run.completed_at,
      (run.lease_token IS NOT NULL AND run.lease_expires_at > clock_timestamp()) AS lease_is_live,
      CASE WHEN run.lease_token IS NOT NULL AND run.lease_expires_at > clock_timestamp()
        THEN GREATEST(1, CEIL(EXTRACT(EPOCH FROM run.lease_expires_at - clock_timestamp())))::int
        ELSE NULL END AS retry_after_seconds
    FROM classifier_runs run
    JOIN classifiers classifier ON classifier.id = run.classifier_id
    WHERE run.id = ${target.runId}
    FOR UPDATE OF run
  `)
  const row = rows[0]
  if (!row) return null
  assertRunMatchesTarget(adapter.slug, row, target)
  await query(sql`/* lockClassifierRunActor */
    SELECT fn_lock_active_user_for_mutation(${row.shared_actor_id}::uuid)
  `)
  const resolved = await adapter.resolve(current, query)
  if (
    !resolved ||
    !resolved.configurationSha256.equals(row.configuration_sha256) ||
    resolved.configurationJson !== row.configuration_json ||
    resolved.actorId !== row.shared_actor_id ||
    (resolved.remote === null) !== (row.decision_batch_id === null)
  ) {
    return null
  }
  return { row, resolved }
}

/** Locks the run a lease was issued for; null when its identity is no longer current. */
export function lockLeaseTarget<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  query: OwnedTransaction,
  lease: ClassifierRunLease<C>,
): Promise<LockedClassifierRun<C> | null> {
  return lockClassifierRun(adapter, query, {
    runId: lease.runId,
    subject: lease.subject,
    inputSha256: lease.inputSha256,
    configurationSha256: lease.resolved.configurationSha256,
  })
}

/** Locks the run only while the lease is still the live, exclusive claim on a current identity. */
export async function lockHeldClassifierRun<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  query: OwnedTransaction,
  lease: ClassifierRunLease<C>,
): Promise<LockedClassifierRun<C> | null> {
  const locked = await lockLeaseTarget(adapter, query, lease)
  return locked && leaseMatches(locked.row, lease) ? locked : null
}

export function leaseMatches<C>(row: ClassifierRunRow, lease: ClassifierRunLease<C>): boolean {
  return (
    row.id === lease.runId &&
    row.lease_token === lease.leaseToken &&
    row.lease_is_live &&
    row.decision_batch_id === lease.decisionBatchId &&
    row.completed_at === null &&
    row.terminal_failed_at === null
  )
}

function assertRunMatchesTarget(slug: string, row: ClassifierRunRow, target: ClassifierRunTarget) {
  if (
    row.classifier_slug !== slug ||
    row.post_id !== target.subject.postId ||
    row.rss_feed_item_id !== target.subject.rssFeedItemId ||
    !row.input_sha256.equals(target.inputSha256) ||
    !row.configuration_sha256.equals(target.configurationSha256)
  ) {
    throw new Error('classifier run identity does not match its snapshot')
  }
}
