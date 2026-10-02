import { randomUUID } from 'node:crypto'
import { POST_CLASSIFIER_SLUG } from '@voucha/types/entities/post-classifier'
import type { ClassifierRunJobData } from '../queues/ai-agents/types.mts'
import {
  listIncompleteClassifierRuns,
  type IncompleteClassifierRun,
} from '../services/classifier-runs/index.mts'
import {
  processClassifierRun,
  processClassifierRunDispatcher,
} from '../workers/ai-agents/processors/process-classifier-run.mts'
import type { ClassifierRunHandler } from '../workers/ai-agents/processors/classifier-run-handler.mts'
import type { ReconcileClassifierRunsDependencies } from '../workers/ai-agents/processors/process-reconcile-classifier-runs.mts'
import { getClassifierRunFacts } from './data-stores/psql/classifier-runs/run-facts.mts'
import {
  createApprovedClassifierPost,
  requestPostClassifierRun,
} from './data-stores/psql/post-classifier/execution.mts'

export { POST_CLASSIFIER_SLUG, requestPostClassifierRun }

type DispatcherJob = Parameters<typeof processClassifierRunDispatcher>[0]
type RunJob = Parameters<typeof processClassifierRun>[0]

export function classifierRunDispatcherJobFor(postId: string, classifier = POST_CLASSIFIER_SLUG) {
  return {
    id: randomUUID(),
    name: 'classifier-run-dispatcher',
    data: { classifier, postId, rssFeedItemId: null },
  } as DispatcherJob
}

export function classifierRunDispatcherJobForFeedItem(rssFeedItemId: string, classifier: string) {
  return {
    id: randomUUID(),
    name: 'classifier-run-dispatcher',
    data: { classifier, postId: null, rssFeedItemId },
  } as DispatcherJob
}

export function classifierRunJobFor(data: ClassifierRunJobData) {
  return { id: randomUUID(), name: 'classifier-run', data } as RunJob
}

/** An approved post whose request was written, reserved by the real dispatcher and queued. */
export async function dispatchApprovedClassifierPost(remote: boolean) {
  const setup = await createApprovedClassifierPost(remote, true)
  await requestPostClassifierRun(setup.post, setup.inputSha256)
  await processClassifierRunDispatcher(classifierRunDispatcherJobFor(setup.post.id))
  const run = (await getClassifierRunFacts(setup.post.id, POST_CLASSIFIER_SLUG))[0]
  if (!run) throw new Error('Expected the dispatcher to reserve a classifier run')
  const data: ClassifierRunJobData = {
    classifier: POST_CLASSIFIER_SLUG,
    runId: run.id,
    postId: setup.post.id,
    rssFeedItemId: null,
    inputSha256: run.input_sha256.toString('hex'),
    configurationSha256: run.configuration_sha256.toString('hex'),
  }
  return { ...setup, runId: run.id, data }
}

/**
 * The sweep is global by design, and it counts, gives up on and ages every incomplete run it lists.
 * Parallel test files share one database, so this scopes both discovery queries to the posts and
 * runs a test made: their counters, terminal state and alarms never depend on (or disturb) others.
 */
export function createClassifierRunSweepScope(realHandler: ClassifierRunHandler) {
  const postIds = new Set<string>()
  const rssFeedItemIds = new Set<string>()
  const runIds = new Set<string>()
  const handler: ClassifierRunHandler = {
    ...realHandler,
    // Pending requests are paged by random request id, so a test's own request can sit on any page
    // of the shared database's global pool: keep reading until a page holds one of this scope's.
    pendingRequests: async function scopedPendingRequests(
      after: string | null,
    ): ReturnType<ClassifierRunHandler['pendingRequests']> {
      const page = await realHandler.pendingRequests(after)
      const items = page.items.filter(item =>
        item.postId !== null
          ? postIds.has(item.postId)
          : item.rssFeedItemId !== null && rssFeedItemIds.has(item.rssFeedItemId),
      )
      return items.length > 0 || !page.next ? { ...page, items } : scopedPendingRequests(page.next)
    },
  }

  /** Pages of at most `pageSize` of this scope's runs, whatever else the database holds. */
  function incomplete(pageSize: number): ReconcileClassifierRunsDependencies['listIncomplete'] {
    return async after => {
      const found: IncompleteClassifierRun[] = []
      let cursor = after
      do {
        const page = await listIncompleteClassifierRuns(cursor, 100)
        found.push(...page.items.filter(run => runIds.has(run.runId)))
        cursor = page.next
      } while (cursor && found.length <= pageSize)
      const items = found.slice(0, pageSize)
      return { items, next: found.length > pageSize ? (items.at(-1)?.runId ?? null) : null }
    }
  }

  return {
    handler,
    postIds,
    rssFeedItemIds,
    runIds,
    track(post: { id: string }, runId: string) {
      postIds.add(post.id)
      runIds.add(runId)
    },
    /** Scopes the sweep to a run of an RSS feed item, whose subject has no post. */
    trackFeedItem(rssFeedItemId: string, runId: string) {
      rssFeedItemIds.add(rssFeedItemId)
      runIds.add(runId)
    },
    reset() {
      postIds.clear()
      rssFeedItemIds.clear()
      runIds.clear()
    },
    dependencies(
      overrides: Partial<ReconcileClassifierRunsDependencies> = {},
      pageSize = 500,
    ): ReconcileClassifierRunsDependencies {
      return {
        listIncomplete: incomplete(pageSize),
        handlers: () => [handler],
        handlerFor: () => handler,
        evaluateSpendCap: async () => null,
        ...overrides,
      }
    },
  }
}
