import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { closeValkeyClients } from 'valkyries'

const mockCloseValkeyClients = vi.fn<typeof closeValkeyClients>(() => Promise.resolve())
const mockGlideMqInstance = { close: vi.fn<() => Promise<void>>(() => Promise.resolve()) }
const mockCloseSharedCommandClient = vi.fn<() => Promise<void>>(() => Promise.resolve())

async function createShutdown() {
  const { createGracefulShutdown } = await import('./shutdown.mts')
  return createGracefulShutdown({
    getGlideMQInstances: () => [mockGlideMqInstance],
    closeValkeyClients: mockCloseValkeyClients,
    closeSharedCommandClientFromRegistry: mockCloseSharedCommandClient,
  })
}

describe('valkey shutdown facade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCloseValkeyClients.mockReset()
    mockCloseValkeyClients.mockResolvedValue(undefined)
    mockGlideMqInstance.close.mockReset()
    mockGlideMqInstance.close.mockResolvedValue(undefined)
    mockCloseSharedCommandClient.mockReset()
    mockCloseSharedCommandClient.mockResolvedValue(undefined)
  })

  it('waits for every dynamic config startup before reporting failures', async () => {
    const { onGracefulShutdown } = await import('./shutdown.mts')
    let releaseSecond!: () => void
    const second = new Promise<void>(resolve => {
      releaseSecond = resolve
    })
    const firstError = new Error('first startup failed')
    const thirdError = new Error('third startup failed')
    const pending = onGracefulShutdown.waitForInitialization([
      { waitForInitialization: () => Promise.reject(firstError) },
      { waitForInitialization: () => second },
      { waitForInitialization: () => Promise.reject(thirdError) },
    ])
    let finished = false
    const result = pending.then(
      () => {
        finished = true
        return undefined
      },
      (err: unknown) => {
        finished = true
        return err
      },
    )
    await Promise.resolve()
    expect(finished).toBe(false)

    releaseSecond()
    expect(await result).toMatchObject({
      name: 'AggregateError',
      errors: [firstError, thirdError],
    })
  })

  it('accepts completed dynamic config startups', async () => {
    const { onGracefulShutdown } = await import('./shutdown.mts')
    await expect(
      onGracefulShutdown.waitForInitialization([
        { waitForInitialization: async () => {} },
        { waitForInitialization: async () => {} },
      ]),
    ).resolves.toBeUndefined()
  })

  it('closes GlideMQ instances and valkyries clients once, failing on client close errors', async () => {
    const onGracefulShutdown = await createShutdown()

    await onGracefulShutdown()
    await onGracefulShutdown()

    expect(mockGlideMqInstance.close).toHaveBeenCalledTimes(1)
    expect(mockCloseValkeyClients).toHaveBeenCalledTimes(1)
    expect(mockCloseValkeyClients).toHaveBeenCalledWith({ throwOnError: true })
  })

  it('does not close the shared command client before GlideMQ drain resolves', async () => {
    let resolveGlideMqClose: (() => void) | undefined
    mockGlideMqInstance.close.mockReturnValueOnce(
      new Promise<void>(resolve => {
        resolveGlideMqClose = resolve
      }),
    )
    const onGracefulShutdown = await createShutdown()

    const shutdownPromise = onGracefulShutdown()
    for (let flushAttempts = 0; flushAttempts < 10; flushAttempts += 1) {
      if (resolveGlideMqClose !== undefined) {
        break
      }
      await Promise.resolve()
    }

    expect(mockCloseSharedCommandClient).not.toHaveBeenCalled()
    expect(resolveGlideMqClose).toBeDefined()
    resolveGlideMqClose?.()
    await shutdownPromise

    expect(mockCloseSharedCommandClient).toHaveBeenCalledTimes(1)
    expect(mockGlideMqInstance.close.mock.invocationCallOrder[0]).toBeLessThan(
      mockCloseSharedCommandClient.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
  })

  it('surfaces a valkyries client close failure after closing everything else', async () => {
    const clientFailure = new AggregateError(
      [new Error('client close failed')],
      'Valkey shutdown failed',
    )
    mockCloseValkeyClients.mockRejectedValueOnce(clientFailure)
    const onGracefulShutdown = await createShutdown()

    await expect(onGracefulShutdown()).rejects.toMatchObject({ errors: [clientFailure] })

    expect(mockGlideMqInstance.close).toHaveBeenCalledTimes(1)
    expect(mockCloseSharedCommandClient).toHaveBeenCalledTimes(1)
  })

  it('propagates GlideMQ close failures', async () => {
    const error = new Error('glide close failed')
    mockGlideMqInstance.close.mockRejectedValueOnce(error)
    const onGracefulShutdown = await createShutdown()

    await expect(onGracefulShutdown()).rejects.toMatchObject({ errors: [error] })
  })

  it('attempts every close and propagates all cleanup failures', async () => {
    const glideError = new Error('glide close failed')
    const valkyriesError = new Error('valkyries close failed')
    const sharedClientError = new Error('shared client close failed')
    mockGlideMqInstance.close.mockRejectedValueOnce(glideError)
    mockCloseValkeyClients.mockRejectedValueOnce(valkyriesError)
    mockCloseSharedCommandClient.mockRejectedValueOnce(sharedClientError)
    const onGracefulShutdown = await createShutdown()

    await expect(onGracefulShutdown()).rejects.toMatchObject({
      errors: [glideError, valkyriesError, sharedClientError],
    })

    expect(mockGlideMqInstance.close).toHaveBeenCalledTimes(1)
    expect(mockCloseValkeyClients).toHaveBeenCalledTimes(1)
    expect(mockCloseSharedCommandClient).toHaveBeenCalledTimes(1)
  })

  it('converts non-Error close failures before reporting them', async () => {
    mockCloseValkeyClients.mockRejectedValueOnce('valkey close failed')
    const onGracefulShutdown = await createShutdown()

    await expect(onGracefulShutdown()).rejects.toMatchObject({
      errors: [expect.objectContaining({ message: 'valkey close failed' })],
    })
  })
})
