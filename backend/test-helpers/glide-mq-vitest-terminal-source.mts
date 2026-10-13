import { EventEmitter } from 'node:events'
import { TestQueue, type TestJob } from 'glide-mq/testing'

/** Observe this exact fork-owned public queue from registration, never a local Worker. */
export function createTestQueueTerminalSource(queue: TestQueue, prefix: string | undefined) {
  const events = new EventEmitter()
  let closing: Promise<void> | undefined
  const completed = (job: TestJob) => events.emit('completed', { jobId: job.id })
  const failed = (job: TestJob | undefined, error: unknown) => {
    if (!job?.id) {
      events.emit('error', error)
      return
    }
    let failedReason: string
    try {
      failedReason = error instanceof Error ? error.message : String(error)
    } catch (err) {
      events.emit('error', err)
      return
    }
    events.emit('failed', { jobId: job.id, failedReason, failureCause: error })
  }
  const failure = (error: unknown) => events.emit('error', error)
  queue.on('completed', completed)
  queue.on('failed', failed)
  queue.on('error', failure)
  return Object.assign(events, {
    // Prefix is the configured factory realm, not an emulated Valkey key namespace.
    queueName: queue.name,
    queuePrefix: prefix,
    async waitUntilReady() {
      if (closing) throw new Error('Owned testing queue source is closed')
    },
    close() {
      return (closing ??= Promise.resolve().then(() => {
        queue.off('completed', completed)
        queue.off('failed', failed)
        queue.off('error', failure)
        return undefined
      }))
    },
  })
}
