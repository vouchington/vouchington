import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import type { JobOptions, Queue } from 'glide-mq'
import { sentryCaptureExceptionMock as captureException } from '../../../test-helpers/vitest.setup.sentry-mock.mts'

type WorkerConstructor = typeof import('glide-mq').Worker
type QueueConstructor = typeof import('glide-mq').Queue
type FlowProducerConstructor = typeof import('glide-mq').FlowProducer

const MAX_RETRY_DELAY_MS = 1_200

const {
  mockTrackJobEnqueue,
  mockWorker,
  mockQueue,
  mockFlowProducer,
  mockSpeedkeyClient,
  mockCreateSpeedkeyClient,
} = vi.hoisted(() => {
  const speedkeyClient = { close: vi.fn<VitestLooseMock>() }
  const worker = vi.fn<WorkerConstructor>() as Mock<WorkerConstructor> & WorkerConstructor
  worker.prototype.close = vi.fn<typeof import('glide-mq').Worker.prototype.close>()
  const queue = vi.fn<QueueConstructor>() as Mock<QueueConstructor> & QueueConstructor
  queue.prototype.close = vi.fn<typeof import('glide-mq').Queue.prototype.close>()
  const flowProducer = vi.fn<FlowProducerConstructor>() as Mock<FlowProducerConstructor> &
    FlowProducerConstructor
  flowProducer.prototype.close = vi.fn<typeof import('glide-mq').FlowProducer.prototype.close>()
  return {
    mockTrackJobEnqueue: vi.fn<VitestLooseMock>(),
    mockWorker: worker,
    mockQueue: queue,
    mockFlowProducer: flowProducer,
    mockSpeedkeyClient: speedkeyClient,
    mockCreateSpeedkeyClient: vi.fn<VitestLooseMock>(() => Promise.resolve(speedkeyClient)),
  }
})

vi.mock<typeof import('glide-mq')>(import('glide-mq'), () => ({
  Worker: mockWorker,
  Queue: mockQueue,
  FlowProducer: mockFlowProducer,
}))
vi.mock<typeof import('@glidemq/speedkey')>(import('@glidemq/speedkey'), () => ({
  GlideClient: {
    createClient: mockCreateSpeedkeyClient,
  } as unknown as typeof import('@glidemq/speedkey').GlideClient,
}))

const importGlideMqRegistry = () => import('@data-stores/valkey-core/glide-mq-registry')
function createRejectingQueueStub<TData>(error: Error) {
  return {
    add(_name: string, _data: TData, _opts?: JobOptions) {
      return Promise.reject(error)
    },
    addBulk(_jobs: Array<{ name: string; data: TData; opts?: JobOptions }>) {
      return Promise.reject(error)
    },
  } as Pick<Queue<TData>, 'add' | 'addBulk'>
}

/** Queue stub that fails failCount times then resolves. */
function createEventualSuccessQueueStub<TData>(failCount: number, successResult: unknown) {
  let calls = 0
  return {
    add(_name: string, _data: TData, _opts?: JobOptions) {
      calls++
      if (calls <= failCount) return Promise.reject(new Error('Reached maximum inflight requests'))
      return Promise.resolve(successResult)
    },
    addBulk(_jobs: Array<{ name: string; data: TData; opts?: JobOptions }>) {
      calls++
      if (calls <= failCount) return Promise.reject(new Error('Reached maximum inflight requests'))
      return Promise.resolve([successResult])
    },
    getCalls: () => calls,
  } as Pick<Queue<TData>, 'add' | 'addBulk'> & { getCalls: () => number }
}

describe('glide-mq-factory shared client injection', () => {
  beforeEach(() => {
    vi.resetModules()
    mockWorker.mockClear()
    mockQueue.mockClear()
    mockFlowProducer.mockClear()
    mockTrackJobEnqueue.mockClear()
    mockSpeedkeyClient.close.mockClear()
    mockCreateSpeedkeyClient.mockClear()
  })

  it('does not create the real Speedkey client on import', async () => {
    const { workerQueueCommandClient } = await import('../glide-mq-shared-client.mts')
    expect(mockCreateSpeedkeyClient).not.toHaveBeenCalled()

    await workerQueueCommandClient.close()

    expect(mockCreateSpeedkeyClient).toHaveBeenCalledOnce()
    expect(mockSpeedkeyClient.close).toHaveBeenCalledOnce()
  })

  it('passes shared commandClient to createWorker', async () => {
    const [{ createWorker }, { workerQueueCommandClient }] = await Promise.all([
      import('../glide-mq-factory.mts'),
      import('../glide-mq-shared-client.mts'),
    ])
    createWorker('test-queue', () => Promise.resolve())
    const workerOpts = mockWorker.mock.calls.at(-1)?.[2] as Record<string, unknown> | undefined
    expect(workerOpts?.commandClient).toBe(workerQueueCommandClient)
  })

  it('passes shared client to createQueue', async () => {
    const [{ createQueue }, { workerQueueCommandClient }] = await Promise.all([
      import('../glide-mq-factory.mts'),
      import('../glide-mq-shared-client.mts'),
    ])
    createQueue('test-queue')
    const queueOpts = mockQueue.mock.calls.at(-1)?.[1] as Record<string, unknown> | undefined
    expect(queueOpts?.client).toBe(workerQueueCommandClient)
  })

  it('passes shared client to createFlowProducer', async () => {
    const [{ createFlowProducer }, { workerQueueCommandClient }] = await Promise.all([
      import('../glide-mq-factory.mts'),
      import('../glide-mq-shared-client.mts'),
    ])
    createFlowProducer()
    const fpOpts = mockFlowProducer.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined
    expect(fpOpts?.client).toBe(workerQueueCommandClient)
  })

  it('shutdown callback closes the real client when it was realized', async () => {
    const { closeSharedCommandClientFromRegistry } = await importGlideMqRegistry()
    const { workerQueueCommandClient } = await import('../glide-mq-shared-client.mts')
    await workerQueueCommandClient.close()
    mockSpeedkeyClient.close.mockClear()
    await closeSharedCommandClientFromRegistry()
    expect(mockSpeedkeyClient.close).toHaveBeenCalledOnce()
  })

  it('shutdown callback is a no-op when client was never realized', async () => {
    const { closeSharedCommandClientFromRegistry } = await importGlideMqRegistry()
    await import('../glide-mq-shared-client.mts')
    // Client was never used, commandClient and commandClientPromise are null
    await expect(closeSharedCommandClientFromRegistry()).resolves.toBeUndefined()
    expect(mockSpeedkeyClient.close).not.toHaveBeenCalled()
  })
})

describe('glide-mq-factory', () => {
  beforeEach(() => {
    vi.resetModules()
    mockTrackJobEnqueue.mockClear()
  })

  it('tracks enqueue attempts and reports rejected promises', async () => {
    const { createEnqueueFunction } = await import('../glide-mq-enqueue.mts')
    const error = new Error('enqueue failed')
    const enqueue = createEnqueueFunction({
      queue: createRejectingQueueStub<{ id: string }>(error),
      queueName: 'queue',
      jobName: 'job',
      trackJobEnqueue: mockTrackJobEnqueue,
    })

    await expect(enqueue({ id: '1' })).rejects.toThrow(error)

    expect(mockTrackJobEnqueue).toHaveBeenCalledWith('queue', 'job')
    expect(captureException).toHaveBeenCalledWith(error, expect.anything())
  })

  it('tracks bulk counts and decorates rejected promises before reporting', async () => {
    const { createBulkEnqueueFunction } = await import('../glide-mq-enqueue.mts')
    const error = new Error('bulk failed')
    const enqueueBulk = createBulkEnqueueFunction({
      queue: createRejectingQueueStub<{ id: string }>(error),
      queueName: 'queue',
      jobName: 'job',
      buildJob: input => ({ data: input }),
      trackJobEnqueue: mockTrackJobEnqueue,
      decorateError: (err, context) => {
        err.extra = { count: context.count, operation: context.callContext }
        err.tags = { critical: true }
        return err
      },
    })

    await expect(enqueueBulk([{ id: '1' }, { id: '2' }], undefined, 'bulk-op')).rejects.toThrow(
      error,
    )

    expect(mockTrackJobEnqueue).toHaveBeenCalledWith('queue', 'job', 2)
    expect(captureException).toHaveBeenCalledWith(error, expect.anything())
    expect(error).toMatchObject({
      extra: { count: 2, operation: 'bulk-op' },
      tags: { critical: true },
    })
  })

  describe('enqueue retry on transient Valkey errors', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('createEnqueueFunction retries a transient error and succeeds when the queue recovers', async () => {
      const { createEnqueueFunction } = await import('../glide-mq-enqueue.mts')
      const stub = createEventualSuccessQueueStub<{ id: string }>(1, { id: 'job-1' })
      const enqueue = createEnqueueFunction({
        queue: stub,
        queueName: 'q',
        jobName: 'j',
        trackJobEnqueue: mockTrackJobEnqueue,
      })

      const promise = enqueue({ id: '1' })
      // Advance timers so the retry delay fires; advanceTimersByTimeAsync flushes
      // microtasks between ticks, so promise is fully resolved after the await.
      await vi.advanceTimersByTimeAsync(MAX_RETRY_DELAY_MS)
      await expect(promise).resolves.toEqual({ id: 'job-1' })

      expect(stub.getCalls()).toBe(2)
      expect(captureException).not.toHaveBeenCalled()
      expect(mockTrackJobEnqueue).toHaveBeenCalledWith('q', 'j')
    })

    it('createEnqueueFunction reports to onError after exhausting all retry attempts', async () => {
      const { createEnqueueFunction } = await import('../glide-mq-enqueue.mts')
      const transientError = new Error('Reached maximum inflight requests')
      const enqueue = createEnqueueFunction({
        queue: createRejectingQueueStub<{ id: string }>(transientError),
        queueName: 'q',
        jobName: 'j',
        trackJobEnqueue: mockTrackJobEnqueue,
      })

      const promiseRejection = enqueue({ id: '1' }).catch((error: unknown) => error)
      await vi.advanceTimersByTimeAsync(MAX_RETRY_DELAY_MS * 2)
      await expect(promiseRejection).resolves.toBe(transientError)

      expect(captureException).toHaveBeenCalledWith(transientError, expect.anything())
    })

    it('createEnqueueFunction does not retry when retry: false', async () => {
      const { createEnqueueFunction } = await import('../glide-mq-enqueue.mts')
      const stub = createEventualSuccessQueueStub<{ id: string }>(1, { id: 'job-1' })
      const enqueue = createEnqueueFunction({
        queue: stub,
        queueName: 'q',
        jobName: 'j',
        retry: false,
        trackJobEnqueue: mockTrackJobEnqueue,
      })

      await expect(enqueue({ id: '1' })).rejects.toThrow('Reached maximum inflight requests')

      expect(stub.getCalls()).toBe(1)
      expect(captureException).toHaveBeenCalledTimes(1)
    })

    it('createBulkEnqueueFunction retries a transient error and succeeds when the queue recovers', async () => {
      const { createBulkEnqueueFunction } = await import('../glide-mq-enqueue.mts')
      const stub = createEventualSuccessQueueStub<{ id: string }>(1, { id: 'bulk-1' })
      const enqueueBulk = createBulkEnqueueFunction({
        queue: stub,
        queueName: 'q',
        jobName: 'j',
        buildJob: input => ({ data: input }),
        trackJobEnqueue: mockTrackJobEnqueue,
      })

      const promise = enqueueBulk([{ id: '1' }])
      await vi.advanceTimersByTimeAsync(MAX_RETRY_DELAY_MS)
      await expect(promise).resolves.toEqual([{ id: 'bulk-1' }])

      expect(stub.getCalls()).toBe(2)
      expect(captureException).not.toHaveBeenCalled()
    })

    it('createBulkEnqueueFunction does not retry when retry: false', async () => {
      const { createBulkEnqueueFunction } = await import('../glide-mq-enqueue.mts')
      const stub = createEventualSuccessQueueStub<{ id: string }>(1, { id: 'bulk-1' })
      const enqueueBulk = createBulkEnqueueFunction({
        queue: stub,
        queueName: 'q',
        jobName: 'j',
        buildJob: input => ({ data: input }),
        retry: false,
        trackJobEnqueue: mockTrackJobEnqueue,
      })

      await expect(enqueueBulk([{ id: '1' }])).rejects.toThrow('Reached maximum inflight requests')

      expect(stub.getCalls()).toBe(1)
      expect(captureException).toHaveBeenCalledTimes(1)
    })
  })
})
