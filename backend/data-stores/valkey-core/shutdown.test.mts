import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCloseValkeyClients = vi.fn<() => Promise<void>>(() => Promise.resolve())
const mockDynamicConfig = { close: vi.fn<() => Promise<void>>(() => Promise.resolve()) }
const mockGlideMqInstance = { close: vi.fn<() => Promise<void>>(() => Promise.resolve()) }
const mockCloseSharedCommandClient = vi.fn<() => Promise<void>>(() => Promise.resolve())

async function createShutdown() {
  const { createGracefulShutdown } = await import('./shutdown.mts')
  return createGracefulShutdown({
    dynamicConfigs: new Set([mockDynamicConfig]),
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
    mockDynamicConfig.close.mockReset()
    mockDynamicConfig.close.mockResolvedValue(undefined)
    mockGlideMqInstance.close.mockReset()
    mockGlideMqInstance.close.mockResolvedValue(undefined)
    mockCloseSharedCommandClient.mockReset()
    mockCloseSharedCommandClient.mockResolvedValue(undefined)
  })

  it('closes dynamic configs before GlideMQ instances and valkyries clients once', async () => {
    const onGracefulShutdown = await createShutdown()

    await onGracefulShutdown()
    await onGracefulShutdown()

    expect(mockDynamicConfig.close).toHaveBeenCalledTimes(1)
    expect(mockGlideMqInstance.close).toHaveBeenCalledTimes(1)
    expect(mockCloseValkeyClients).toHaveBeenCalledTimes(1)
    expect(mockDynamicConfig.close.mock.invocationCallOrder[0]).toBeLessThan(
      mockGlideMqInstance.close.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
    expect(mockDynamicConfig.close.mock.invocationCallOrder[0]).toBeLessThan(
      mockCloseValkeyClients.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
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

  it('propagates dynamic config close failures after closing clients', async () => {
    const error = new Error('dynamic config close failed')
    mockDynamicConfig.close.mockRejectedValueOnce(error)
    const onGracefulShutdown = await createShutdown()

    await expect(onGracefulShutdown()).rejects.toMatchObject({ errors: [error] })

    expect(mockGlideMqInstance.close).toHaveBeenCalledTimes(1)
    expect(mockCloseValkeyClients).toHaveBeenCalledTimes(1)
    expect(mockCloseSharedCommandClient).toHaveBeenCalledTimes(1)
  })

  it('propagates GlideMQ close failures', async () => {
    const error = new Error('glide close failed')
    mockGlideMqInstance.close.mockRejectedValueOnce(error)
    const onGracefulShutdown = await createShutdown()

    await expect(onGracefulShutdown()).rejects.toMatchObject({ errors: [error] })
  })

  it('attempts every close and propagates all cleanup failures', async () => {
    const dynamicConfigError = new Error('dynamic config close failed')
    const glideError = new Error('glide close failed')
    const valkyriesError = new Error('valkyries close failed')
    const sharedClientError = new Error('shared client close failed')
    mockDynamicConfig.close.mockRejectedValueOnce(dynamicConfigError)
    mockGlideMqInstance.close.mockRejectedValueOnce(glideError)
    mockCloseValkeyClients.mockRejectedValueOnce(valkyriesError)
    mockCloseSharedCommandClient.mockRejectedValueOnce(sharedClientError)
    const onGracefulShutdown = await createShutdown()

    await expect(onGracefulShutdown()).rejects.toMatchObject({
      errors: [dynamicConfigError, glideError, valkyriesError, sharedClientError],
    })

    expect(mockDynamicConfig.close).toHaveBeenCalledTimes(1)
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
