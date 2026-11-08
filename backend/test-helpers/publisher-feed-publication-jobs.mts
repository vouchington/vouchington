import { beginTransaction, withTransactionOptions, type TransactionQuery } from '@data-stores/psql'
import type { Job } from 'glide-mq'
import {
  PUBLISHER_TYPE_FEED_PUBLICATION_JOB,
  type PublisherTypeFeedJobData,
} from '@queues/background/enqueues/post-publication-jobs'
import { backgroundQueue } from './shared-background-queue.mts'

/** Observe only owned changed-topic snapshots and remove the resulting root admissions. */
export async function capturePublisherFeedPublicationJobs(
  topicIds: readonly string[],
  mutation: () => Promise<unknown>,
) {
  const owned = new Set(topicIds)
  const ids = new Set<string>()
  const added = (job: { id: string; name: string; data: unknown }) => {
    const data = job.data as Partial<PublisherTypeFeedJobData>
    if (
      job.name === PUBLISHER_TYPE_FEED_PUBLICATION_JOB.name &&
      data.topicIds?.some(id => owned.has(id))
    )
      ids.add(job.id)
  }
  backgroundQueue.on('added', added)
  try {
    await mutation()
    const jobs = await Promise.all(
      [...ids].map(async id => {
        const job = await backgroundQueue.getJob(id)
        if (!job) throw new Error(`Missing publisher feed capture ${id}`)
        await job.remove()
        return job.data as PublisherTypeFeedJobData
      }),
    )
    return jobs
  } finally {
    backgroundQueue.off('added', added)
  }
}

/** Capture native queue stream admissions without inspecting unrelated queue rows. */
export async function capturePublisherFeedPageJobs<T>(
  changeId: string,
  expectedAdded: number,
  action: () => Promise<T>,
) {
  const [{ QueueEvents }, { realGlideConnection }, { waitForRealGlideEvent }] = await Promise.all([
    import('glide-mq'),
    import('./real-glide-connection.mts'),
    import('./real-glide-terminal-deadline.mts'),
  ])
  const events = new QueueEvents(backgroundQueue.name, {
    ...realGlideConnection,
    lastEventId: '$',
    blockTimeout: 1000,
  })
  const jobs: NonNullable<Awaited<ReturnType<typeof backgroundQueue.getJob>>>[] = []
  const added = Promise.withResolvers<void>()
  events.on('added', (event: { jobId: string }) => {
    void backgroundQueue
      .getJob(event.jobId)
      .then(job => {
        if (job && (job.data as { changeId?: string }).changeId === changeId) {
          jobs.push(job)
          if (jobs.length >= expectedAdded) added.resolve()
        }
      })
      .catch(added.reject)
  })
  events.on('error', added.reject)
  try {
    const [result] = await Promise.all([
      events.waitUntilReady().then(action),
      waitForRealGlideEvent(added.promise, 'publisher feed page admissions'),
    ])
    return { result, jobs }
  } finally {
    await events.close()
  }
}

/** Narrow an owned native dispatcher job at the queue read boundary. */
export async function readPublisherTypeFeedJob(id: string): Promise<Job<PublisherTypeFeedJobData>> {
  const job = await backgroundQueue.getJob(id)
  if (!job || job.name !== PUBLISHER_TYPE_FEED_PUBLICATION_JOB.name)
    throw new Error(`Missing publisher feed dispatcher ${id}`)
  const data = job.data as Partial<PublisherTypeFeedJobData>
  if (
    typeof data.changeId !== 'string' ||
    !Array.isArray(data.topicIds) ||
    !data.topicIds.every(topicId => typeof topicId === 'string') ||
    (data.afterTopicId !== null && typeof data.afterTopicId !== 'string')
  )
    throw new TypeError('Invalid publisher feed dispatcher payload')
  return job as Job<PublisherTypeFeedJobData>
}

/** Own the real transaction lifecycle for publisher-capture commit and rollback assertions. */
export async function withPublisherFeedCaptureTransaction(
  operation: (query: TransactionQuery) => Promise<void>,
  commit = true,
): Promise<void> {
  await using query = await beginTransaction()
  await operation(query)
  if (commit) await query.commit()
}

/** A successful nested capture joins the outer commit; a rejection rolls back its action scope. */
export async function withPublisherFeedCaptureSavepoint(
  query: TransactionQuery,
  operation: (query: TransactionQuery) => Promise<void>,
): Promise<void> {
  await withTransactionOptions({ client: query.client }, operation)
}
