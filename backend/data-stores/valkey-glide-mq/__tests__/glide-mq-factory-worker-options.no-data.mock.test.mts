import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { setTestWorkerProcessorDecorator } from '../test-worker-processor-decorator.mts'

type WorkerConstructor = typeof import('glide-mq').Worker

const { mockWorker, mockSpeedkeyClient, mockCreateSpeedkeyClient } = vi.hoisted(() => {
  const speedkeyClient = { close: vi.fn<VitestLooseMock>() }
  const worker = vi.fn<WorkerConstructor>() as Mock<WorkerConstructor> & WorkerConstructor
  worker.prototype.close = vi.fn<typeof import('glide-mq').Worker.prototype.close>()
  return {
    mockWorker: worker,
    mockSpeedkeyClient: speedkeyClient,
    mockCreateSpeedkeyClient: vi.fn<VitestLooseMock>(() => Promise.resolve(speedkeyClient)),
  }
})

vi.mock<typeof import('glide-mq')>(import('glide-mq'), () => ({
  Worker: mockWorker,
}))
vi.mock<typeof import('@glidemq/speedkey')>(import('@glidemq/speedkey'), async importOriginal => ({
  ...(await importOriginal()),
  GlideClient: {
    createClient: mockCreateSpeedkeyClient,
  } as unknown as typeof import('@glidemq/speedkey').GlideClient,
}))

type CapturedWorkerOptions = Record<string, unknown> & {
  commandClient: { ping(): Promise<unknown> }
}

const processor = () => Promise.resolve()

function lastWorkerOptions(): CapturedWorkerOptions {
  return mockWorker.mock.calls.at(-1)?.[2] as unknown as CapturedWorkerOptions
}

async function importFactory() {
  const [factory, { workerQueueCommandClient }, registry, testDecorator] = await Promise.all([
    import('../glide-mq-factory.mts'),
    import('../glide-mq-shared-client.mts'),
    import('@data-stores/valkey-core/glide-mq-registry'),
    import('../test-worker-processor-decorator.mts'),
  ])
  return { ...factory, workerQueueCommandClient, ...registry, ...testDecorator }
}

describe('createWorker stall budget', () => {
  beforeEach(() => {
    vi.resetModules()
    mockWorker.mockClear()
  })
  afterEach(() => setTestWorkerProcessorDecorator(undefined))

  it.each([
    ['no override', {}, 2],
    ['an explicit undefined', { maxStalledCount: undefined }, 2],
    ['a stricter budget', { maxStalledCount: 1 }, 1],
    ['a looser budget', { maxStalledCount: 5 }, 5],
  ])('uses the factory default for %s', async (_label, options, expected) => {
    const { createWorker } = await importFactory()

    createWorker('stall-budget-queue', processor, options)

    expect(lastWorkerOptions().maxStalledCount).toBe(expected)
  })

  it('applies the same stall budget to batch workers and forwards the batch options', async () => {
    const { createBatchWorker } = await importFactory()
    const batchProcessor = () => Promise.resolve([])

    createBatchWorker('batch-queue', batchProcessor, { batch: { size: 3, timeout: 100 } })

    expect(mockWorker.mock.calls.at(-1)?.[1]).toBeTypeOf('function')
    expect(lastWorkerOptions()).toMatchObject({
      maxStalledCount: 2,
      batch: { size: 3, timeout: 100 },
    })
  })

  it('injects the configured test processor decorator into app-created workers', async () => {
    const { createWorker, setTestWorkerProcessorDecorator } = await importFactory()
    const decorated = vi.fn<(processor: unknown) => unknown>(processor => processor)
    const callerWrapped = vi.fn<(processor: unknown) => unknown>(processor => processor)
    const decorator = (processor: unknown, queueName: string) => {
      expect(queueName).toBe('profiled-queue')
      return decorated(processor)
    }
    setTestWorkerProcessorDecorator(decorator)
    const options: Parameters<typeof createWorker>[2] & {
      wrapProcessor: (processor: unknown, queueName: string) => unknown
    } = { wrapProcessor: callerWrapped }

    createWorker('profiled-queue', processor, options)

    const wrapProcessor = lastWorkerOptions().wrapProcessor as
      | ((processor: unknown, queueName: string) => unknown)
      | undefined
    const original = vi.fn<() => void>()
    expect(wrapProcessor?.(original, 'profiled-queue')).toBe(original)
    expect(callerWrapped).toHaveBeenCalledWith(original, 'profiled-queue')
    expect(decorated).toHaveBeenCalledWith(original)
  })

  it('keeps the setup profile decorator on factory workers after vi.resetModules()', async () => {
    const { setTestWorkerProcessorDecorator } = await importFactory()
    const [{ wrapRequestQueryProfileProcessor }, { createRequestQueryProfile }] = await Promise.all(
      [
        import('../../../../test-helpers/request-query-profile-worker.mts'),
        import('../../psql/request-query-profile.mts'),
      ],
    )
    setTestWorkerProcessorDecorator(wrapRequestQueryProfileProcessor)

    vi.resetModules()
    const { createWorker } = await importFactory()
    createWorker('profiled-after-reset', processor)
    const wrapProcessor = lastWorkerOptions().wrapProcessor as
      | ((
          processor: (job: { id: string; name: string }) => string,
          queueName: string,
        ) => (job: { id: string; name: string }) => Promise<string>)
      | undefined
    expect(wrapProcessor).toBeTypeOf('function')
    const profile = createRequestQueryProfile()
    const wrapped = wrapProcessor!(() => 'processed', 'profiled-after-reset')

    await expect(
      profile.run(() => wrapped({ id: 'admitted-1', name: 'profiled-job' })),
    ).resolves.toBe('processed')
    expect(profile.workerProfiles()[0]?.identity).toEqual({
      queue: 'profiled-after-reset',
      jobs: [{ id: 'admitted-1', name: 'profiled-job' }],
    })
  })
})

describe('createWorker command client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    mockWorker.mockClear()
    mockSpeedkeyClient.close.mockClear()
    mockCreateSpeedkeyClient.mockClear()
    vi.mocked(mockWorker.prototype.close).mockReset()
  })

  it('shares the process command client unless a dedicated one is requested', async () => {
    const { createWorker, workerQueueCommandClient } = await importFactory()

    createWorker('shared-queue', processor)
    const sharedOptions = lastWorkerOptions()
    createWorker('shared-queue', processor, { dedicatedCommandClient: false })

    expect(sharedOptions.commandClient).toBe(workerQueueCommandClient)
    expect(lastWorkerOptions().commandClient).toBe(workerQueueCommandClient)
  })

  it('gives each dedicated worker its own client without forwarding the option to glide-mq', async () => {
    const { createWorker, workerQueueCommandClient } = await importFactory()

    createWorker('dedicated-queue', processor, { dedicatedCommandClient: true })
    const first = lastWorkerOptions()
    createWorker('dedicated-queue', processor, { dedicatedCommandClient: true })
    const second = lastWorkerOptions()

    expect(first.commandClient).not.toBe(workerQueueCommandClient)
    expect(second.commandClient).not.toBe(workerQueueCommandClient)
    expect(second.commandClient).not.toBe(first.commandClient)
    expect(first).not.toHaveProperty('dedicatedCommandClient')
  })

  it('connects a dedicated client lazily with the worker-queue timeout and inflight limit', async () => {
    vi.stubEnv('WORKER_QUEUE_REQUEST_TIMEOUT_MS', '1234')
    vi.stubEnv('WORKER_QUEUE_INFLIGHT_REQUESTS_LIMIT', '77')
    const { createWorker } = await importFactory()

    createWorker('dedicated-queue', processor, { dedicatedCommandClient: true })
    expect(mockCreateSpeedkeyClient).not.toHaveBeenCalled()

    await lastWorkerOptions().commandClient.ping()

    expect(mockCreateSpeedkeyClient).toHaveBeenCalledOnce()
    expect(mockCreateSpeedkeyClient).toHaveBeenCalledWith(
      expect.objectContaining({
        lazyConnect: true,
        requestTimeout: 1234,
        inflightRequestsLimit: 77,
      }),
    )
  })

  it('registers a dedicated worker for graceful shutdown', async () => {
    const { createWorker, getGlideMQInstances } = await importFactory()

    const worker = createWorker('dedicated-queue', processor, { dedicatedCommandClient: true })

    expect(getGlideMQInstances()).toContain(worker)
  })

  it('closes the dedicated client when its worker closes, once', async () => {
    const { createWorker } = await importFactory()
    const worker = createWorker('dedicated-queue', processor, { dedicatedCommandClient: true })
    await lastWorkerOptions().commandClient.ping()

    await worker.close()
    await worker.close(true)

    expect(mockWorker.prototype.close).toHaveBeenCalledTimes(2)
    expect(mockSpeedkeyClient.close).toHaveBeenCalledOnce()
  })

  it('closes the dedicated client even when closing the worker fails', async () => {
    const { createWorker } = await importFactory()
    const closeError = new Error('worker close failed')
    vi.mocked(mockWorker.prototype.close).mockRejectedValueOnce(closeError)
    const worker = createWorker('dedicated-queue', processor, { dedicatedCommandClient: true })
    await lastWorkerOptions().commandClient.ping()

    await expect(worker.close()).rejects.toBe(closeError)

    expect(mockSpeedkeyClient.close).toHaveBeenCalledOnce()
  })

  it('opens no connection just to close a dedicated client that was never used', async () => {
    const { createWorker } = await importFactory()
    const worker = createWorker('dedicated-queue', processor, { dedicatedCommandClient: true })

    await worker.close()

    expect(mockCreateSpeedkeyClient).not.toHaveBeenCalled()
    expect(mockSpeedkeyClient.close).not.toHaveBeenCalled()
  })

  it('leaves a shared-client worker close untouched', async () => {
    const { createWorker, workerQueueCommandClient } = await importFactory()
    const worker = createWorker('shared-queue', processor)
    await workerQueueCommandClient.ping()

    await worker.close()

    expect(worker.close).toBe(mockWorker.prototype.close)
    expect(mockSpeedkeyClient.close).not.toHaveBeenCalled()
  })
})
