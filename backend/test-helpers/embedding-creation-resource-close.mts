import { Queue, type QueueEvents, type Worker, type QueueEventsOptions } from 'glide-mq'

/** Starts physical closure before draining operations that can depend on those resources. */
export async function closeEmbeddingCreationResources(owner: {
  queue: Queue
  events: QueueEvents | undefined
  workers: Worker[]
  creations: Promise<Worker>[]
  writes: Promise<unknown>[]
  options: Pick<QueueEventsOptions, 'connection' | 'prefix'>
  onError(error: unknown): void
}) {
  const errors: unknown[] = []
  const retain = (results: PromiseSettledResult<unknown>[]) => {
    for (const result of results) if (result.status === 'rejected') errors.push(result.reason)
  }
  const streamsClosed = Promise.allSettled([owner.events?.close(), owner.queue.close()])
  const workerClosures = new Map<Worker, Promise<PromiseSettledResult<void>[]>>()
  const closeKnownWorkers = () => {
    for (const worker of owner.workers)
      if (!workerClosures.has(worker))
        workerClosures.set(worker, Promise.allSettled([worker.close(false)]))
  }
  closeKnownWorkers()
  retain(await Promise.allSettled(owner.creations))
  // An admitted factory can return after closure started; retain its actual worker too.
  closeKnownWorkers()
  // Iteration also retains operations registered while earlier operations settle.
  for (const write of owner.writes) retain(await Promise.allSettled([write]))
  const closedWorkers = (await Promise.all(workerClosures.values())).flat()
  const writersDrained = closedWorkers.every(result => result.status === 'fulfilled')
  retain(closedWorkers)
  retain(await streamsClosed)
  if (writersDrained) {
    // The operation handle is closed. A fresh handle deletes only this owned identity,
    // after every registered operation and every returned physical worker has settled.
    let disposal: Queue | undefined
    try {
      disposal = new Queue(owner.queue.name, owner.options)
      disposal.on('error', owner.onError)
      await disposal.obliterate({ force: true })
    } catch (err) {
      errors.push(err)
    } finally {
      if (disposal) retain(await Promise.allSettled([disposal.close()]))
    }
  }
  return { errors, writersDrained }
}
