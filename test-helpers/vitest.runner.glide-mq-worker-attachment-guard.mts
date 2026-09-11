import type { TestWorker } from 'glide-mq/testing'
import { TestRunner } from 'vitest'
import {
  captureAttachedTestWorkers,
  getUnexpectedAttachedTestWorkerQueueNames,
} from './glide-mq-vitest-internals.mts'

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

export default class GlideMqWorkerAttachmentGuardRunner extends TestRunner {
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
    } catch (error) {
      const queueNames = getUnexpectedAttachedTestWorkerQueueNames(baseline)
      if (queueNames.length === 0) throw error
      const leakError = createWorkerAttachmentLeakError(queueNames)
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n\n${leakError.message}`,
        { cause: error },
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
    } catch (error) {
      const result = suite.result
      if (!result) throw error
      if (!result.errors) result.errors = []
      result.errors.push(
        error instanceof Error
          ? { message: error.message, name: error.name, stack: error.stack }
          : { message: String(error) },
      )
      result.state = 'fail'
    }
  }
}
