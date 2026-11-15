import { QueueEvents, type Job } from 'glide-mq'
import { workerQueueCommandClient } from '@data-stores/valkey-glide-mq/glide-mq-shared-client'
import { background } from '@queues/background/queues'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { realGlideConnection } from './real-glide-connection.mts'

/** Capture just this admission's real stream IDs instead of scanning the shared queue. */
export async function captureRssJobs<T>(
  action: () => T | Promise<T>,
  expectedAdded: number,
  matches: (job: Job) => boolean,
  onCaptured: (job: NonNullable<Awaited<ReturnType<typeof background.getJob>>>) => void,
): Promise<{ result: T; jobs: NonNullable<Awaited<ReturnType<typeof background.getJob>>>[] }> {
  // QueueEvents starts its first XREAD asynchronously. '$' can skip an admission that reaches
  // Valkey before that read, even after waitUntilReady() resolves. Anchor to the stream tail
  // before running this action, then only accept jobs matching this invocation.
  const eventsKey = `${realGlideConnection.prefix ?? 'glide'}:{${background.name}}:events`
  const tail = await workerQueueCommandClient.xrevrange(
    eventsKey,
    { value: '+' },
    { value: '-' },
    { count: 1 },
  )
  const lastEventId = Object.keys(tail ?? {})[0] ?? '0-0'
  const events = new QueueEvents(background.name, {
    ...realGlideConnection,
    lastEventId,
    blockTimeout: 1_000,
  })
  const jobs: NonNullable<Awaited<ReturnType<typeof background.getJob>>>[] = []
  let resolveAdded: () => void = () => {}
  let rejectAdded: (error: unknown) => void = () => {}
  const added = new Promise<void>((resolve, reject) => {
    resolveAdded = resolve
    rejectAdded = reject
  })
  events.on('added', (event: { jobId: string }) => {
    void background
      .getJob(event.jobId)
      .then(job => {
        if (job && matches(job)) {
          onCaptured(job)
          jobs.push(job)
          if (jobs.length >= expectedAdded) resolveAdded()
        }
      })
      .catch(rejectAdded)
  })
  events.on('error', rejectAdded)
  try {
    const [result] = await Promise.all([
      events.waitUntilReady().then(action),
      waitForRealGlideEvent(added, `${expectedAdded} RSS admissions`),
    ])
    return { result, jobs: jobs.slice(0, expectedAdded) }
  } finally {
    await events.close()
  }
}
