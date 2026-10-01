import type { TestWorker } from 'glide-mq/testing'
import type { TestRunner } from 'vitest'
import {
  captureAttachedTestWorkers,
  getUnexpectedAttachedTestWorkerQueueNames,
} from './glide-mq-vitest-internals.mts'
import SharedDbScopeGuardRunner from './vitest.runner.shared-db-scope-guard.mts'

function createWorkerAttachmentLeakError(queueNames: string[]): Error {
  return new Error(
    [
      '[vitest-glide-mq-worker-attachment-leak] TestWorker instances remained attached after this test file:',
      ...queueNames.map(queueName => `- ${queueName}`),
      'Close every worker created by the file in its afterAll cleanup (await worker.close()).',
      'This guard intentionally does not close workers, so the leak remains visible at its source.',
    ].join('\n'),
  )
}

export default class GlideMqWorkerAttachmentGuardRunner extends SharedDbScopeGuardRunner {
  #baselines = new Map<string, ReadonlySet<TestWorker>>()

  override async importFile(
    filepath: string,
    source: Parameters<TestRunner['importFile']>[1],
  ): Promise<void> {
    if (source !== 'collect') {
      await super.importFile(filepath, source)
      return
    }

    const baseline = captureAttachedTestWorkers()
    this.#baselines.set(filepath, baseline)
    try {
      await super.importFile(filepath, source)
    } catch (err) {
      const queueNames = getUnexpectedAttachedTestWorkerQueueNames(baseline)
      if (queueNames.length === 0) throw err
      const leakError = createWorkerAttachmentLeakError(queueNames)
      throw new Error(
        `${err instanceof Error ? err.message : String(err)}\n\n${leakError.message}`,
        { cause: err },
      )
    }
  }

  override async onAfterRunSuite(suite: Parameters<TestRunner['onAfterRunSuite']>[0]) {
    await super.onAfterRunSuite(suite)
    if (!('filepath' in suite) || typeof suite.filepath !== 'string') return
    try {
      const baseline = this.#baselines.get(suite.filepath)
      if (!baseline) throw new Error('GlideMQ worker attachment guard baseline was not initialized')

      const queueNames = getUnexpectedAttachedTestWorkerQueueNames(baseline)
      if (queueNames.length === 0) return
      throw createWorkerAttachmentLeakError(queueNames)
    } catch (err) {
      const result = suite.result
      if (!result) throw err
      if (!result.errors) result.errors = []
      result.errors.push(
        err instanceof Error
          ? { message: err.message, name: err.name, stack: err.stack }
          : { message: String(err) },
      )
      result.state = 'fail'
    }
  }
}
