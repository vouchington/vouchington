/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- oxfmt rewrites it() to test() outside *.test.* files, and jest/no-export forbids exporting this registrar from a test file */
import { afterEach, expect, test, vi } from 'vitest'

type NamedQueue = {
  readonly queueName: string
}

type Closable = {
  close: () => Promise<unknown>
}

export type WorkerServeImportRuntime = {
  readonly default: readonly Closable[]
  readonly sqsConsumers: readonly Closable[]
}

type ServeImportEnvName = 'NODE_PREWARM' | 'NODE_PREWARM_PORT' | 'NODE_ENV' | 'QUEUES'

function restoreServeImportEnv(name: ServeImportEnvName, original: string | undefined): void {
  switch (name) {
    case 'NODE_PREWARM':
      if (original === undefined) {
        // oxlint-disable-next-line no-mistakes/no-delete-property -- restore the unset value captured before the import
        delete process.env.NODE_PREWARM
      } else {
        process.env.NODE_PREWARM = original
      }
      return
    case 'NODE_PREWARM_PORT':
      if (original === undefined) {
        // oxlint-disable-next-line no-mistakes/no-delete-property -- restore the unset value captured before the import
        delete process.env.NODE_PREWARM_PORT
      } else {
        process.env.NODE_PREWARM_PORT = original
      }
      return
    case 'NODE_ENV':
      if (original === undefined) {
        // oxlint-disable-next-line no-mistakes/no-delete-property -- restore the unset value captured before the import
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = original
      }
      return
    case 'QUEUES':
      if (original === undefined) {
        // oxlint-disable-next-line no-mistakes/no-delete-property -- restore the unset value captured before the import
        delete process.env.QUEUES
      } else {
        process.env.QUEUES = original
      }
  }
}

function excludedQueueSelection(
  workerDefinitions: readonly NamedQueue[],
  sqsConsumerDefinitions: readonly NamedQueue[],
): string {
  return [...workerDefinitions, ...sqsConsumerDefinitions]
    .map(definition => `-${definition.queueName}`)
    .join(',')
}

/** Call from a literal `describe` in the worker entrypoint test. */
export function registerWorkerServeImportTest(options: {
  workerDefinitions: readonly NamedQueue[]
  sqsConsumerDefinitions: readonly NamedQueue[]
  loadRuntime: () => Promise<WorkerServeImportRuntime>
}): void {
  afterEach(() => {
    vi.resetModules()
  })

  test('registers the serve wrapper on import without starting selected workers', async () => {
    const originalNodePrewarm = process.env.NODE_PREWARM
    const originalNodePrewarmPort = process.env.NODE_PREWARM_PORT
    const originalNodeEnv = process.env.NODE_ENV
    const originalQueues = process.env.QUEUES

    try {
      process.env.NODE_PREWARM = '1'
      // NODE_PREWARM_PORT must stay unset: the runtime now only binds a real prewarm
      // listener when it is explicitly set, and pool: 'forks' + isolate: false means a
      // sibling serve.prewarm.test.mts run in the same fork could otherwise leave it set.
      // oxlint-disable-next-line no-mistakes/no-delete-property -- the prewarm port must stay unset so pool forks do not bind a listener
      delete process.env.NODE_PREWARM_PORT
      process.env.NODE_ENV = 'production'
      process.env.QUEUES = excludedQueueSelection(
        options.workerDefinitions,
        options.sqsConsumerDefinitions,
      )

      const runtime = await options.loadRuntime()
      expect(Array.isArray(runtime.default)).toBe(true)
      expect(Array.isArray(runtime.sqsConsumers)).toBe(true)
      await Promise.all(runtime.default.map(worker => worker.close()))
      await Promise.all(runtime.sqsConsumers.map(consumer => consumer.close()))
    } finally {
      restoreServeImportEnv('NODE_PREWARM', originalNodePrewarm)
      restoreServeImportEnv('NODE_PREWARM_PORT', originalNodePrewarmPort)
      restoreServeImportEnv('NODE_ENV', originalNodeEnv)
      restoreServeImportEnv('QUEUES', originalQueues)
    }
  })
}
