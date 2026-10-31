import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { waitForRealGlideEvent } from './real-glide-terminal-deadline.mts'

/** Runs one real job in a private queue prefix; production continuations remain observable. */
export async function runRealRssMaintenanceJob(
  queueName: string,
  name: string,
  data: Record<string, unknown>,
  processJob: (job: Job) => Promise<unknown>,
): Promise<unknown> {
  const prefix = `${workerQueuePrefix}-rss-maintenance-${randomUUID()}`
  const queue = new Queue(queueName, { connection: workerQueueConnection, prefix })
  let worker: Worker | undefined
  const completed = Promise.withResolvers<unknown>()
  try {
    const job = await queue.add(name, data, { priority: 10, attempts: 1 })
    if (!job) throw new Error(`Expected ${name} to enqueue`)
    worker = new Worker(queueName, processJob, {
      connection: workerQueueConnection,
      prefix,
      concurrency: 1,
      blockTimeout: 100,
    })
    worker.on('error', error => completed.reject(error))
    worker.on('failed', (_failed, error) => completed.reject(error))
    worker.on('completed', (done: Job, result) => {
      if (done.id === job.id) completed.resolve(result)
    })
    return await waitForRealGlideEvent(completed.promise, `RSS maintenance ${name}`)
  } finally {
    await worker?.close()
    await queue.obliterate({ force: true })
    await queue.close()
  }
}
