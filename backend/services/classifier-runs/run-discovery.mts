import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { CLASSIFIER_RUN_SWEEP_ENQUEUE_BOUND } from './run-sweep.mts'
import type { ClassifierRunAdapter } from './types.mts'

export const CLASSIFIER_RUN_DISCOVERY_PAGE_SIZE = 100

const FIRST_UUID = '00000000-0000-0000-0000-000000000000'

export type IncompleteClassifierRun = {
  runId: string
  classifier: string
  postId: string | null
  rssFeedItemId: string | null
  inputSha256: string
  configurationSha256: string
  /** When the run was reserved; the sweep derives run age from it. */
  createdAt: Date
  /** Sweep enqueues that added a job; a run at the bound is given up, not enqueued. */
  sweepEnqueueCount: number
}

export type PendingClassifierRunRequest = {
  requestId: string
  postId: string | null
  rssFeedItemId: string | null
  createdAt: Date
}

export type DiscoveryPage<T> = { items: T[]; next: string | null }

type IncompleteRow = {
  id: string
  classifier_slug: string
  post_id: string | null
  rss_feed_item_id: string | null
  input_sha256: Buffer
  configuration_sha256: Buffer
  created_at: Date
  sweep_enqueue_count: number
}

/**
 * One keyset page of recoverable runs: not complete, not superseded, not terminal. A run exactly at
 * the sweep bound is still listed so the sweep can give it up once its last job is gone; a run past
 * the bound was already given up and is a deliberate stop.
 */
export async function listIncompleteClassifierRuns(
  after: string | null,
  limit = CLASSIFIER_RUN_DISCOVERY_PAGE_SIZE,
): Promise<DiscoveryPage<IncompleteClassifierRun>> {
  const { rows } = await write<IncompleteRow>(sql`/* listIncompleteClassifierRuns */
    SELECT run.id, classifier.slug AS classifier_slug, run.post_id, run.rss_feed_item_id,
      run.input_sha256, run.configuration_sha256, run.created_at, run.sweep_enqueue_count
    FROM classifier_runs run
    JOIN classifiers classifier ON classifier.id = run.classifier_id
    WHERE run.id > COALESCE(${after}::uuid, ${FIRST_UUID}::uuid)
      AND run.completed_at IS NULL AND run.superseded_at IS NULL AND run.terminal_failed_at IS NULL
      AND run.sweep_enqueue_count <= ${CLASSIFIER_RUN_SWEEP_ENQUEUE_BOUND}
    ORDER BY run.id
    LIMIT ${limit}
  `)
  return {
    items: rows.map(row => ({
      runId: row.id,
      classifier: row.classifier_slug,
      postId: row.post_id,
      rssFeedItemId: row.rss_feed_item_id,
      inputSha256: row.input_sha256.toString('hex'),
      configurationSha256: row.configuration_sha256.toString('hex'),
      createdAt: row.created_at,
      sweepEnqueueCount: row.sweep_enqueue_count,
    })),
    next: rows.length === limit ? (rows[rows.length - 1]?.id ?? null) : null,
  }
}

type RequestRow = {
  id: string
  post_id: string | null
  rss_feed_item_id: string | null
  created_at: Date
}

/**
 * One keyset page of subjects that were requested for this classifier but never reserved a run:
 * unsettled requests the adapter's own eligibility predicate accepts. This is the discovery that
 * recovers a subject whose run reservation never happened, whatever the reason.
 */
export async function listPendingClassifierRunRequests<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  after: string | null,
  limit = CLASSIFIER_RUN_DISCOVERY_PAGE_SIZE,
): Promise<DiscoveryPage<PendingClassifierRunRequest>> {
  const { rows } = await write<RequestRow>(
    sql`/* listPendingClassifierRunRequests */
    SELECT request.id, request.post_id, request.rss_feed_item_id, request.created_at
    FROM classifier_run_requests request
    JOIN classifiers classifier ON classifier.id = request.classifier_id
    WHERE classifier.slug = ${adapter.slug}
      AND request.id > COALESCE(${after}::uuid, ${FIRST_UUID}::uuid)
      AND request.run_id IS NULL AND request.no_work_at IS NULL AND request.stale_at IS NULL
      AND (`.append(adapter.requestEligibility()).append(sql`)
    ORDER BY request.id
    LIMIT ${limit}
  `),
  )
  return {
    items: rows.map(row => ({
      requestId: row.id,
      postId: row.post_id,
      rssFeedItemId: row.rss_feed_item_id,
      createdAt: row.created_at,
    })),
    next: rows.length === limit ? (rows[rows.length - 1]?.id ?? null) : null,
  }
}
