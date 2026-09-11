import { describe, expect, it, vi } from 'vitest'
import {
  createSqsConsumer,
  loadSqsConsumers,
  selectedSqsConsumerDefinitions,
  type SqsConsumerDefinition,
  type SqsConsumerHandler,
  type SqsConsumerPort,
  type SqsMessage,
} from './sqs-consumer.mts'

const DEFINITIONS: SqsConsumerDefinition[] = [
  {
    queueName: 'bedrock-batch-sqs',
    load: vi.fn<VitestLooseMock>(() => Promise.resolve({ name: 'bedrock-batch-sqs' })),
  },
  {
    queueName: 'ses-bounce-sqs',
    requiresExplicitInclusion: true,
    load: vi.fn<VitestLooseMock>(() => Promise.resolve({ name: 'ses-bounce-sqs' })),
  },
]

describe('selectedSqsConsumerDefinitions', () => {
  it('selects all non-explicit-inclusion consumers when QUEUES is unset', () => {
    const selected = selectedSqsConsumerDefinitions(DEFINITIONS, undefined)
    const names = selected.map(d => d.queueName)

    expect(names).toContain('bedrock-batch-sqs')
    expect(names).not.toContain('ses-bounce-sqs')
  })

  it('includes an explicit-inclusion consumer only when listed in QUEUES', () => {
    const selected = selectedSqsConsumerDefinitions(DEFINITIONS, 'ses-bounce-sqs')
    const names = selected.map(d => d.queueName)

    expect(names).toContain('ses-bounce-sqs')
    expect(names).not.toContain('bedrock-batch-sqs')
  })

  it('drops an unknown include-mode queue name instead of throwing, and reports it', () => {
    const onUnknownIncludes = vi.fn<(unknownQueueNames: readonly string[]) => void>()
    const selected = selectedSqsConsumerDefinitions(
      DEFINITIONS,
      'bedrock-batch-sqs,queue-monitoring',
      onUnknownIncludes,
    )
    const names = selected.map(d => d.queueName)

    expect(names).toEqual(['bedrock-batch-sqs'])
    expect(onUnknownIncludes).toHaveBeenCalledExactlyOnceWith(['queue-monitoring'])
  })

  it('does not report a queue name owned by a sibling runtime as unknown, and does not select it', () => {
    // Regression: a queueClass: 'all' deployment puts every policy-known queue name into one
    // QUEUES include list, including glide-mq queue names this SqsConsumerDefinition array never
    // implements. Without queueNamesOwnedByOtherRuntimes those would be reported as topology skew
    // on every boot.
    const onUnknownIncludes = vi.fn<(unknownQueueNames: readonly string[]) => void>()
    const selected = selectedSqsConsumerDefinitions(
      DEFINITIONS,
      'bedrock-batch-sqs,emails',
      onUnknownIncludes,
      ['emails'],
    )
    const names = selected.map(d => d.queueName)

    expect(names).toEqual(['bedrock-batch-sqs'])
    expect(onUnknownIncludes).not.toHaveBeenCalled()
  })

  it('calls load on selected definitions and returns their resolved consumers', async () => {
    const consumers = await loadSqsConsumers(DEFINITIONS, 'bedrock-batch-sqs')

    const def = DEFINITIONS.find(d => d.queueName === 'bedrock-batch-sqs')!
    expect(def.load).toHaveBeenCalledOnce()
    expect(consumers).toEqual([{ name: 'bedrock-batch-sqs' }])
  })

  it('drops a definition whose load() resolves null instead of failing the batch', async () => {
    const definitions: SqsConsumerDefinition[] = [
      {
        queueName: 'bedrock-batch-sqs',
        load: vi.fn<VitestLooseMock>(() => Promise.resolve(null)),
      },
      {
        queueName: 'ses-bounce-sqs',
        load: vi.fn<VitestLooseMock>(() => Promise.resolve({ name: 'ses-bounce-sqs' })),
      },
    ]

    const consumers = await loadSqsConsumers(definitions, 'bedrock-batch-sqs,ses-bounce-sqs')

    expect(consumers).toEqual([{ name: 'ses-bounce-sqs' }])
  })
})

function createDeferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// Simulates a real long-polling receive: the first call resolves immediately with
// `firstBatch`, and every subsequent call hangs until the abort signal fires (mirroring
// AWS_SDK's `abortSignal` option on ReceiveMessageCommand), then rejects like a real
// AbortError would.
function createOneShotPort(firstBatch: SqsMessage[], deleteCalls: string[]): SqsConsumerPort {
  let receiveCallCount = 0
  return {
    receive: signal =>
      new Promise((resolve, reject) => {
        receiveCallCount += 1
        if (receiveCallCount === 1) {
          resolve(firstBatch)
          return
        }
        signal.addEventListener('abort', () => reject(new Error('AbortError')), { once: true })
      }),
    delete: async receiptHandle => {
      deleteCalls.push(receiptHandle)
    },
  }
}

describe('createSqsConsumer', () => {
  it('delivers a received message to the handler and deletes it once handling succeeds', async () => {
    const message: SqsMessage = { messageId: 'm1', body: '{}', receiptHandle: 'rh1' }
    const deleteCalls: string[] = []
    const port = createOneShotPort([message], deleteCalls)
    const handleMessage = vi.fn<SqsConsumerHandler>(() => Promise.resolve())

    const consumer = createSqsConsumer({ name: 'test', queueUrl: 'unused', handleMessage, port })
    const deleted = new Promise<SqsMessage>(resolve => consumer.once('message-deleted', resolve))

    const deletedMessage = await deleted
    await consumer.close()

    expect(handleMessage).toHaveBeenCalledExactlyOnceWith(message)
    expect(deleteCalls).toEqual(['rh1'])
    expect(deletedMessage).toEqual(message)
  })

  it('emits message-failed and leaves the message undeleted when the handler throws', async () => {
    const message: SqsMessage = { messageId: 'm1', body: 'bad', receiptHandle: 'rh1' }
    const deleteCalls: string[] = []
    const port = createOneShotPort([message], deleteCalls)
    const handlerError = new Error('boom')
    const handleMessage: SqsConsumerHandler = () => Promise.reject(handlerError)

    const consumer = createSqsConsumer({ name: 'test', queueUrl: 'unused', handleMessage, port })
    const failed = new Promise<[SqsMessage, unknown]>(resolve =>
      consumer.once('message-failed', (msg: SqsMessage, error: unknown) => resolve([msg, error])),
    )

    const [failedMessage, error] = await failed
    await consumer.close()

    expect(failedMessage).toEqual(message)
    expect(error).toBe(handlerError)
    expect(deleteCalls).toEqual([])
  })

  it('emits message-delete-failed but keeps polling when port.delete rejects', async () => {
    const message: SqsMessage = { messageId: 'm1', body: '{}', receiptHandle: 'rh1' }
    let receiveCallCount = 0
    const deleteError = new Error('delete failed')
    const port: SqsConsumerPort = {
      receive: signal =>
        new Promise((resolve, reject) => {
          receiveCallCount += 1
          if (receiveCallCount === 1) {
            resolve([message])
            return
          }
          signal.addEventListener('abort', () => reject(new Error('AbortError')), { once: true })
        }),
      delete: () => Promise.reject(deleteError),
    }
    const handleMessage = vi.fn<SqsConsumerHandler>(() => Promise.resolve())

    const consumer = createSqsConsumer({ name: 'test', queueUrl: 'unused', handleMessage, port })
    const deleteFailed = new Promise<[SqsMessage, unknown]>(resolve =>
      consumer.once('message-delete-failed', (msg: SqsMessage, error: unknown) =>
        resolve([msg, error]),
      ),
    )

    const [failedMessage, error] = await deleteFailed
    await consumer.close()

    expect(failedMessage).toEqual(message)
    expect(error).toBe(deleteError)
  })

  it('emits poll-error and keeps polling when receive rejects for a reason other than abort', async () => {
    const receiveError = new Error('network blip')
    let receiveCallCount = 0
    const port: SqsConsumerPort = {
      receive: signal =>
        new Promise((_resolve, reject) => {
          receiveCallCount += 1
          if (receiveCallCount === 1) {
            reject(receiveError)
            return
          }
          signal.addEventListener('abort', () => reject(new Error('AbortError')), { once: true })
        }),
      delete: () => Promise.resolve(),
    }
    const handleMessage = vi.fn<SqsConsumerHandler>(() => Promise.resolve())

    const consumer = createSqsConsumer({ name: 'test', queueUrl: 'unused', handleMessage, port })
    const pollError = new Promise<unknown>(resolve => consumer.once('poll-error', resolve))

    const error = await pollError
    await consumer.close()

    expect(error).toBe(receiveError)
    expect(handleMessage).not.toHaveBeenCalled()
  })

  it('close() aborts an in-flight long poll without acking any message', async () => {
    let receiveCallCount = 0
    const port: SqsConsumerPort = {
      receive: signal =>
        new Promise((_resolve, reject) => {
          receiveCallCount += 1
          signal.addEventListener('abort', () => reject(new Error('AbortError')), { once: true })
        }),
      delete: () => Promise.resolve(),
    }
    const handleMessage = vi.fn<SqsConsumerHandler>(() => Promise.resolve())

    const consumer = createSqsConsumer({ name: 'test', queueUrl: 'unused', handleMessage, port })
    await consumer.close()

    expect(receiveCallCount).toBe(1)
    expect(handleMessage).not.toHaveBeenCalled()
  })

  it('close() waits for an in-flight handler to finish before resolving, then deletes the message', async () => {
    const message: SqsMessage = { messageId: 'm1', body: '{}', receiptHandle: 'rh1' }
    const deleteCalls: string[] = []
    const port = createOneShotPort([message], deleteCalls)

    const handlerStarted = createDeferred<void>()
    const releaseHandler = createDeferred<void>()
    const handleMessage: SqsConsumerHandler = async () => {
      handlerStarted.resolve()
      await releaseHandler.promise
    }

    const consumer = createSqsConsumer({ name: 'test', queueUrl: 'unused', handleMessage, port })

    await handlerStarted.promise
    const closePromise = consumer.close()
    expect(deleteCalls).toEqual([])

    releaseHandler.resolve()
    await closePromise

    expect(deleteCalls).toEqual(['rh1'])
  })

  it('close() is idempotent and emits closing/closed exactly once', async () => {
    const port: SqsConsumerPort = {
      receive: signal =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('AbortError')), { once: true })
        }),
      delete: () => Promise.resolve(),
    }
    const handleMessage = vi.fn<SqsConsumerHandler>(() => Promise.resolve())
    const consumer = createSqsConsumer({ name: 'test', queueUrl: 'unused', handleMessage, port })

    const closingSpy = vi.fn<() => void>()
    const closedSpy = vi.fn<() => void>()
    consumer.on('closing', closingSpy)
    consumer.on('closed', closedSpy)

    await Promise.all([consumer.close(), consumer.close()])

    expect(closingSpy).toHaveBeenCalledTimes(1)
    expect(closedSpy).toHaveBeenCalledTimes(1)
  })
})
