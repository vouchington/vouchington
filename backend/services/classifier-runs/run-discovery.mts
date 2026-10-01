import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  retireIneligibleClassifierRunRequests,
  type IneligibleClassifierRunRequest,
} from './run-retirement.mts'
import { CLASSIFIER_RUN_SWEEP_ENQUEUE_BOUND } from './run-sweep.mts'
import type { ClassifierRunAdapter, ClassifierRunSubject } from './types.mts'

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
  input_sha256: Buffer
  created_at: Date
  eligible: boolean
}

function subjectOf(row: RequestRow): ClassifierRunSubject {
  if (row.post_id !== null) return { postId: row.post_id, rssFeedItemId: null }
  if (row.rss_feed_item_id !== null) return { postId: null, rssFeedItemId: row.rss_feed_item_id }
  throw new Error(`classifier run request ${row.id} has no subject`)
}

/**
 * One keyset page of subjects that were requested for this classifier but never reserved a run:
 * unsettled requests the adapter's own eligibility predicate accepts. This is the discovery that
 * recovers a subject whose run reservation never happened, whatever the reason.
 *
 * A request the predicate rejects is not left to be re-scanned every sweep. If its subject is no
 * longer live at the content it asked for (deleted, unapproved, or moved to new content), that
 * content version can never be classified, so the request is retired as stale; a request whose
 * subject is live and only waiting (for an embedding) stays pending. A producer that makes the
 * subject live again re-arms the request. See `retireIneligibleClassifierRunRequests`.
 */
export async function listPendingClassifierRunRequests<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  after: string | null,
  limit = CLASSIFIER_RUN_DISCOVERY_PAGE_SIZE,
): Promise<DiscoveryPage<PendingClassifierRunRequest>> {
  const { rows } = await write<RequestRow>(
    sql`/* listPendingClassifierRunRequests */
    SELECT request.id, request.post_id, request.rss_feed_item_id, request.input_sha256,
      request.created_at, (`.append(adapter.requestEligibility()).append(sql`) AS eligible
    FROM classifier_run_requests request
    JOIN classifiers classifier ON classifier.id = request.classifier_id
    WHERE classifier.slug = ${adapter.slug}
      AND request.id > COALESCE(${after}::uuid, ${FIRST_UUID}::uuid)
      AND request.run_id IS NULL AND request.no_work_at IS NULL AND request.stale_at IS NULL
    ORDER BY request.id
    LIMIT ${limit}
  `),
  )
  const items: PendingClassifierRunRequest[] = []
  const ineligible: IneligibleClassifierRunRequest[] = []
  for (const row of rows) {
    if (row.eligible) {
      items.push({
        requestId: row.id,
        postId: row.post_id,
        rssFeedItemId: row.rss_feed_item_id,
        createdAt: row.created_at,
      })
    } else {
      ineligible.push({ subject: subjectOf(row), inputSha256: row.input_sha256 })
    }
  }
  await retireIneligibleClassifierRunRequests(adapter, ineligible)
  return {
    items,
    next: rows.length === limit ? (rows[rows.length - 1]?.id ?? null) : null,
  }
}
