import { AsyncLocalStorage } from 'node:async_hooks'
import {
  type TestJob,
  type TestJobRecord,
  TestQueue,
  type TestQueueOptions,
} from 'glide-mq/testing'
const testWorkerProcessorContext = new AsyncLocalStorage<true>()

/** Run a shim Worker processor so nested Queue.add can detect in-processor enqueue. */
export function runInsideTestWorkerProcessor<T>(fn: () => T): T {
  return testWorkerProcessorContext.run(true, fn)
}

export function isInsideTestWorkerProcessor(): boolean {
  return testWorkerProcessorContext.getStore() === true
}

export function wrapTestWorkerProcessor<R>(
  processor: (job: any) => Promise<R> | R,
): (job: any) => Promise<R> {
  return job => runInsideTestWorkerProcessor(() => Promise.resolve(processor(job)))
}

/** Record identity distinguishes old running jobs from new jobs reusing an obliterated id. */
export function recordOf(job: TestJob): TestJobRecord {
  // oxlint-disable-next-line no-underscore-dangle -- glide-mq exposes no public identity for a test job
  return (job as unknown as { _record: TestJobRecord })._record
}

export class ShimTestQueue<D = any, R = any> extends TestQueue<D, R> {
  /** Flush waiters, woken by actual job transitions. */
  readonly settleWaiters = new Set<() => void>()
  readonly #notifySettleWaiters = () => {
    for (const waiter of [...this.settleWaiters]) waiter()
  }

  constructor(name: string, options?: TestQueueOptions) {
    super(name, options)
    this.on('retrying', (job: TestJob) => {
      // Native promote changes the record synchronously and emits the wake-up event.
      void job.promote().catch(() => undefined)
    })
    for (const event of [
      'failed',
      'completed',
      'delay-changed',
      'suspended',
      'promoted',
      'removed',
      'revoked',
      'drained',
    ]) {
      this.on(event, this.#notifySettleWaiters)
    }
  }
  override async obliterate(...args: Parameters<TestQueue<D, R>['obliterate']>): Promise<void> {
    await super.obliterate(...args)
    this.#notifySettleWaiters()
  }
}

const queues = new Map<string, ShimTestQueue>()

async function listAttachedWorkers(): Promise<Array<{ queueName: string; workerId: string }>> {
  const infos = [...queues].map(async ([queueName, queue]) =>
    (await queue.getWorkers()).map(worker => ({ queueName, workerId: worker.id })),
  )
  return (await Promise.all(infos)).flat()
}

/** Snapshot the id of every TestWorker currently attached through the in-memory queue shim. */
export async function captureAttachedTestWorkers(): Promise<ReadonlySet<string>> {
  return new Set((await listAttachedWorkers()).map(({ workerId }) => workerId))
}

/**
 * Return queue names that acquired an attached TestWorker after the supplied fork baseline.
 * Queue names, rather than workers, make the guard's remediation actionable and deterministic.
 */
export async function getUnexpectedAttachedTestWorkerQueueNames(
  baseline: ReadonlySet<string>,
): Promise<string[]> {
  const attached = await listAttachedWorkers()
  const unexpected = attached.filter(({ workerId }) => !baseline.has(workerId))
  return [...new Set(unexpected.map(({ queueName }) => queueName))].toSorted()
}

export function getOrCreateQueue(name: string, options?: TestQueueOptions): ShimTestQueue {
  let queue = queues.get(name)
  if (!queue) {
    queue = new ShimTestQueue(name, options)
    queues.set(name, queue)
  }
  if (options?.deadLetterQueue) {
    queue.deadLetterQueueName = options.deadLetterQueue.name
    // Register the fork-owned store before native workers or flows resolve it by name.
    getOrCreateQueue(options.deadLetterQueue.name)
  }
  return queue
}

const MAX_TEST_WORKER_CONCURRENCY = 15

/** Clamp a requested worker concurrency to the in-memory test worker cap. */
export function clampTestWorkerConcurrency(concurrency?: number): number {
  return concurrency != null
    ? Math.min(concurrency, MAX_TEST_WORKER_CONCURRENCY)
    : MAX_TEST_WORKER_CONCURRENCY
}
