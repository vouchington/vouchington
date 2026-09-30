import { read, write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type ClassifierRunFacts = {
  id: string
  classifier_slug: string
  post_id: string | null
  rss_feed_item_id: string | null
  input_sha256: Buffer
  configuration_sha256: Buffer
  decision_batch_id: string | null
  provider_attempts_started: number
  sweep_enqueue_count: number
  terminal_failure_kind: string | null
  terminal_failed_at: Date | null
  superseded_at: Date | null
  lease_token: string | null
  outcomes_persisted_at: Date | null
  completed_at: Date | null
}

export type ClassifierRunRequestFacts = {
  id: string
  classifier_slug: string
  input_sha256: Buffer
  run_id: string | null
  no_work_at: Date | null
  stale_at: Date | null
}

/** Every run receipt of one post, optionally scoped to one classifier, oldest first. */
export async function getClassifierRunFacts(
  postId: string,
  slug: string | null = null,
  query: QueryExecutor = read,
): Promise<ClassifierRunFacts[]> {
  const { rows } = await query<ClassifierRunFacts>(sql`/* getClassifierRunFacts */
    SELECT run.id, classifier.slug AS classifier_slug, run.post_id, run.rss_feed_item_id,
      run.input_sha256, run.configuration_sha256, run.decision_batch_id,
      run.provider_attempts_started, run.sweep_enqueue_count, run.terminal_failure_kind,
      run.terminal_failed_at, run.superseded_at, run.lease_token, run.outcomes_persisted_at,
      run.completed_at
    FROM classifier_runs run
    JOIN classifiers classifier ON classifier.id = run.classifier_id
    WHERE run.post_id = ${postId} AND (${slug}::text IS NULL OR classifier.slug = ${slug})
    ORDER BY run.id
  `)
  return rows
}

export async function getClassifierRunRequestFacts(
  postId: string,
  slug: string | null = null,
): Promise<ClassifierRunRequestFacts[]> {
  const { rows } = await write<ClassifierRunRequestFacts>(sql`/* getClassifierRunRequestFacts */
    SELECT request.id, classifier.slug AS classifier_slug, request.input_sha256, request.run_id,
      request.no_work_at, request.stale_at
    FROM classifier_run_requests request
    JOIN classifiers classifier ON classifier.id = request.classifier_id
    WHERE request.post_id = ${postId} AND (${slug}::text IS NULL OR classifier.slug = ${slug})
    ORDER BY request.id
  `)
  return rows
}

export async function expireClassifierRunLeaseForTest(runId: string): Promise<void> {
  await write(sql`/* expireClassifierRunLeaseForTest */
    UPDATE classifier_runs
    SET leased_at = clock_timestamp() - INTERVAL '2 minutes',
      lease_expires_at = clock_timestamp() - INTERVAL '1 second'
    WHERE id = ${runId}
  `)
}

export async function setClassifierRunSweepEnqueueCountForTest(
  runId: string,
  count: number,
): Promise<void> {
  await write(sql`/* setClassifierRunSweepEnqueueCountForTest */
    UPDATE classifier_runs SET sweep_enqueue_count = ${count} WHERE id = ${runId}
  `)
}

/** Removes a run's request row, as a request lost before it settled would be. */
export async function deleteClassifierRunRequestsForTest(postId: string): Promise<void> {
  await write(sql`/* deleteClassifierRunRequestsForTest */
    DELETE FROM classifier_run_requests WHERE post_id = ${postId}
  `)
}

export async function markClassifierRunTerminalForTest(runId: string, kind: string): Promise<void> {
  await write(sql`/* markClassifierRunTerminalForTest */
    UPDATE classifier_runs
    SET terminal_failure_kind = ${kind}, terminal_failed_at = clock_timestamp(),
      lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    WHERE id = ${runId}
  `)
}
