import { workerQueueCommandClient } from './glide-mq-shared-client.mts'
import { workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { withPagedDispatchPage } from './paged-dispatch-context.mts'
import { createPagedDispatchFences } from './paged-dispatch-fences.mts'
import { createHash } from 'node:crypto'
import type { Job, JobOptions, Queue } from 'glide-mq'
import { processRetainedSweep } from './retained-sweep.mts'
import { getPagedDispatchLimit, type PagedDispatcher } from './paged-dispatcher-config.mts'

/** Reviewed immutable unique keysets; a timestamp alone or updated_at is never a cursor. */
export type DispatchCursorKey = 'id' | 'feedUrl' | 'lane,id' | 'remoteActorId' | 'userId'
const CURSOR_KEYS: readonly string[] = ['id', 'feedUrl', 'lane,id', 'remoteActorId', 'userId']

export const PAGED_DISPATCH_OPTIONS = {
  attempts: 2_147_483_647,
  backoff: { type: 'paged-dispatch', delay: 1000 },
} satisfies Partial<JobOptions>

export function pagedDispatchBackoffStrategies() {
  return Object.fromEntries(
    ['hostnames', 'rss', 'kagi', 'elections', 'notifications', 'activitypub'].map(dispatcher => [
      `paged-dispatch-${dispatcher}`,
      (attempt: number) =>
        Math.min(
          1000 * 2 ** Math.min(attempt, 20),
          getPagedDispatchLimit(`${dispatcher}_backoff_ms`),
        ),
    ]),
  )
}

export function pagedDispatchJobOptions(dispatcher: PagedDispatcher): Partial<JobOptions> {
  return {
    ...PAGED_DISPATCH_OPTIONS,
    backoff: { type: `paged-dispatch-${dispatcher}`, delay: 1000 },
  }
}

/**
 * Admit a single page only while the entire destination queue has capacity. A blocked page keeps
 * its data and yields through the retained-sweep protocol without consuming a retry attempt.
 * The reader supplies a unique immutable keyset, bulk-admits rows with replay identities, and
 * returns the next payload; the helper gives each continuation a deterministic new page id.
 */
export async function processPagedDispatcher<TData extends object, TResult>(
  job: Pick<Job<TData>, 'data' | 'id' | 'name' | 'updateData' | 'moveToDelayed'>,
  options: {
    dispatcher: PagedDispatcher
    cursorKey: DispatchCursorKey
    target: Pick<Queue, 'name' | 'getJobCounts'>
    targetPrefix?: string
    /** Defaults to the destination when dispatchers and row jobs share one queue. */
    continuationQueue?: Pick<Queue, 'name'>
    targetName: 'background' | 'background-cpu'
    readAndDispatch: (
      pageSize: number,
    ) => Promise<{ result: TResult; next?: TData; afterDispatch?: () => Promise<void> }>
    enqueueNext: (data: TData, options: Partial<JobOptions>) => Promise<unknown>
  },
): Promise<TResult> {
  if (!CURSOR_KEYS.includes(options.cursorKey))
    throw new TypeError('Dispatcher requires a unique immutable cursor')
  const fences = createPagedDispatchFences(options.target.name, job.id, options.targetPrefix)
  type Receipt = { result: TResult; next?: TData; nextAdmitted?: boolean }
  const data = job.data as TData & { dispatchReceipt?: Receipt }
  let receipt = data.dispatchReceipt
  let afterDispatch: (() => Promise<void>) | undefined
  if (!receipt) {
    // Capacity gates new row work. A durable receipt must still be allowed to retire its
    // admission fences and finish, including when control jobs themselves fill the queue.
    const counts = await options.target.getJobCounts()
    const depth = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0)
    if (depth > getPagedDispatchLimit(`${options.targetName}_max_depth`)) {
      return processRetainedSweep(job, async () => ({ hasMore: true }), {
        resumeAt: Date.now() + getPagedDispatchLimit(`${options.dispatcher}_backoff_ms`),
      }) as Promise<never>
    }
    const admitted = await withPagedDispatchPage(
      job.id,
      options.targetName,
      () => options.readAndDispatch(getPagedDispatchLimit(`${options.dispatcher}_page_size`)),
      fences.checkpoint,
    )
    const { afterDispatch: commit, ...page } = admitted.value
    afterDispatch = commit
    receipt = page
    // A retry after admission reuses this result instead of reading and admitting another page.
    await job.updateData({ ...job.data, dispatchReceipt: receipt })
  }
  const page = receipt
  let continuationDedupId: string | undefined
  if (page.next) {
    const pageId = createHash('sha256')
      .update(`${job.id}:${JSON.stringify(page.next)}`)
      .digest('hex')
    continuationDedupId = `dispatch_next__${pageId}`
    if (!page.nextAdmitted) {
      await options.enqueueNext(page.next, {
        ...pagedDispatchJobOptions(options.dispatcher),
        jobId: `${job.name}__page__${pageId}`,
        // Covers terminal pruning in the enqueue/checkpoint gap; released after the checkpoint.
        deduplication: { id: continuationDedupId, mode: 'throttle', ttl: Number.MAX_SAFE_INTEGER },
      })
      page.nextAdmitted = true
      await job.updateData({ ...job.data, dispatchReceipt: page })
    }
  }
  await afterDispatch?.()
  if (!(await fences.clearPage(getPagedDispatchLimit(`${options.dispatcher}_page_size`))))
    return processRetainedSweep(job, async () => ({ hasMore: true })) as Promise<never>
  if (continuationDedupId) {
    // The persisted nextAdmitted checkpoint now owns replay safety, so this admission fence
    // must not accumulate for successful pages. Retrying cleanup is safe after child pruning.
    const queue = options.continuationQueue ?? options.target
    await workerQueueCommandClient.hdel(
      `${options.targetPrefix ?? workerQueuePrefix ?? 'glide'}:{${queue.name}}:dedup`,
      [continuationDedupId],
    )
  }
  return page.result
}
