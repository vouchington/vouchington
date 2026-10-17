import { onTestFinished } from 'vitest'
import { Queue, QueueEvents, Worker } from 'glide-mq'
import type { OAuthAuthorizationExchangeJobData } from '../queues/background/enqueues/oauth-authorization-exchange-jobs.mts'
import { observeOAuthExchangeTerminal } from './oauth-exchange-terminal.mts'

export function createOAuthActorCleanupReceipt() {
  let safeToDelete = true
  return {
    beginOwnership() {
      safeToDelete = false
    },
    confirmDrained() {
      safeToDelete = true
    },
    assertSafeToDelete() {
      if (!safeToDelete)
        throw new Error('OAuth fixture deletion withheld: actor drain remains unverified')
    },
  }
}

/** Register before acquisition; timeout cleanup fences admission and drains owned actors before fixture deletion. */
export function ownOAuthActors(
  errors: unknown[],
  receipt: ReturnType<typeof createOAuthActorCleanupReceipt>,
) {
  let closed = false
  let closing: Promise<void> | undefined
  let queue: Queue<OAuthAuthorizationExchangeJobData> | undefined
  const events: QueueEvents[] = []
  const workers: Worker<OAuthAuthorizationExchangeJobData>[] = []
  const operations: Promise<unknown>[] = []
  let settledOperations = 0
  let physicalDrainFailed = false
  const terminals: ReturnType<typeof observeOAuthExchangeTerminal>[] = []
  const assertOpen = () => {
    if (closed) throw new Error('OAuth actor ownership already closed')
  }
  const settle = async (operation: () => Promise<unknown>) => {
    try {
      await operation()
    } catch (err) {
      physicalDrainFailed = true
      if (!errors.includes(err)) errors.push(err)
    }
  }
  const acquire = <T,>(factory: () => T): T => {
    assertOpen()
    receipt.beginOwnership()
    try {
      return factory()
    } catch (err) {
      physicalDrainFailed = true
      throw err
    }
  }
  const dispose = () => {
    if (closing) return closing
    closed = true
    const reason = new Error('OAuth actor owner closed before terminal receipt')
    for (const terminal of terminals) terminal.reject(reason)
    closing = (async () => {
      for (const worker of workers) await settle(() => worker.close())
      for (const stream of events) await settle(() => stream.close())
      // Never destroy jobs if a worker/event close failed or an ownership effect remains unsettled.
      const ownedQueue = queue
      if (ownedQueue) {
        if (!physicalDrainFailed && settledOperations === operations.length) {
          await settle(() => ownedQueue.obliterate())
        }
        // Close is mandatory even when destructive cleanup is withheld.
        await settle(() => ownedQueue.close())
      }
      // Rejected processor operations include the five expected 55P03 attempts.
      // Their job disposition is separate from whether every physical operation has settled.
      await Promise.allSettled(operations)
      if (!physicalDrainFailed && settledOperations === operations.length) receipt.confirmDrained()
    })()
    return closing
  }
  onTestFinished(async () => {
    await dispose()
    if (errors.length)
      throw new AggregateError(errors, 'OAuth actor finish owner failed', { cause: errors[0] })
  })
  return {
    assertOpen,
    dispose,
    queue(factory: () => Queue<OAuthAuthorizationExchangeJobData>) {
      queue = acquire(factory)
      return queue
    },
    events(factory: () => QueueEvents) {
      const stream = acquire(factory)
      events.push(stream)
      return stream
    },
    worker(factory: () => Worker<OAuthAuthorizationExchangeJobData>) {
      const worker = acquire(factory)
      workers.push(worker)
      return worker
    },
    observe(stream: QueueEvents, id: string) {
      assertOpen()
      const terminal = observeOAuthExchangeTerminal(stream, id, err => errors.push(err))
      terminals.push(terminal)
      return terminal
    },
    async run<T>(operation: () => Promise<T>): Promise<T> {
      assertOpen()
      const pending = operation().then(
        value => {
          settledOperations += 1
          return value
        },
        err => {
          settledOperations += 1
          throw err
        },
      )
      operations.push(pending)
      const result = await pending
      assertOpen()
      return result
    },
  }
}
