import { afterEach, describe, expect, it, vi } from 'vitest'
import type { closeValkeyClients } from 'valkyries'

// Closing the process-wide valkyries clients would break every other file sharing a fork, so
// this file runs in the isolated mocks project. The spy passes through to the real close.
const closeValkeyClientsSpy = vi.hoisted(() => vi.fn<typeof closeValkeyClients>())

vi.mock<typeof import('valkyries')>(import('valkyries'), async importOriginal => {
  const actual = await importOriginal<typeof import('valkyries')>()
  closeValkeyClientsSpy.mockImplementation(actual.closeValkeyClients)
  return { ...actual, closeValkeyClients: closeValkeyClientsSpy }
})

// Each case loads a fresh module graph: the shutdown guard and the client registries are module state.
async function loadShutdown() {
  vi.resetModules()
  const { onGracefulShutdown } = await import('./shutdown.mts')
  const registry = await import('./glide-mq-registry.mts')
  const { createDynamicConfigForTest } = await import('../../test-helpers/dynamic-config.mts')
  return { onGracefulShutdown, registry, createDynamicConfigForTest }
}

describe('valkey shutdown facade', () => {
  afterEach(() => {
    vi.resetModules()
    closeValkeyClientsSpy.mockReset()
  })

  it('accepts completed dynamic config startups', async () => {
    const { onGracefulShutdown, createDynamicConfigForTest } = await loadShutdown()
    const config = createDynamicConfigForTest({
      key: `test-shutdown-${crypto.randomUUID()}`,
      fieldTypes: { enabled: 'boolean' },
      defaultFields: { enabled: true },
    })

    await expect(onGracefulShutdown.waitForInitialization()).resolves.toBeUndefined()

    await config.close()
  })

  it('waits for every dynamic config startup before reporting failures', async () => {
    const { onGracefulShutdown, createDynamicConfigForTest } = await loadShutdown()
    const invalid = createDynamicConfigForTest({
      key: `test-shutdown-${crypto.randomUUID()}`,
      fieldTypes: { enabled: 'boolean' },
      defaultFields: { enabled: 'yes' as unknown as boolean },
    })
    const valid = createDynamicConfigForTest({
      key: `test-shutdown-${crypto.randomUUID()}`,
      fieldTypes: { enabled: 'boolean' },
      defaultFields: { enabled: true },
    })

    await expect(onGracefulShutdown.waitForInitialization()).rejects.toMatchObject({
      name: 'AggregateError',
      message: 'Dynamic config initialization failed',
      errors: [expect.any(Error)],
    })

    await invalid.close()
    await valid.close()
  })

  it('closes GlideMQ instances once and the shared command client after them', async () => {
    const { onGracefulShutdown, registry } = await loadShutdown()
    const order: string[] = []
    const instance = {
      close: vi.fn<() => Promise<void>>(async () => {
        order.push('glide')
      }),
    }
    registry.registerGlideMQInstance(instance)
    registry.setSharedCommandClientShutdown(() => {
      order.push('shared')
    })

    await onGracefulShutdown()
    await onGracefulShutdown()

    expect(instance.close).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['glide', 'shared'])
    expect(closeValkeyClientsSpy).toHaveBeenCalledTimes(1)
    expect(closeValkeyClientsSpy).toHaveBeenCalledWith({ throwOnError: true })
  })

  it('surfaces a valkyries client close failure after closing everything else', async () => {
    const { onGracefulShutdown, registry } = await loadShutdown()
    const clientFailure = new AggregateError([new Error('client close failed')], 'close failed')
    const instance = { close: vi.fn<() => Promise<void>>(() => Promise.resolve()) }
    const shared = vi.fn<() => void>()
    registry.registerGlideMQInstance(instance)
    registry.setSharedCommandClientShutdown(shared)
    closeValkeyClientsSpy.mockRejectedValueOnce(clientFailure)

    await expect(onGracefulShutdown()).rejects.toMatchObject({ errors: [clientFailure] })

    expect(instance.close).toHaveBeenCalledTimes(1)
    expect(shared).toHaveBeenCalledTimes(1)
  })

  it('does not close the shared command client before GlideMQ drain resolves', async () => {
    const { onGracefulShutdown, registry } = await loadShutdown()
    const shared = vi.fn<() => void>()
    let releaseGlide!: () => void
    const draining = new Promise<void>(resolve => {
      releaseGlide = resolve
    })
    let drainStarted!: () => void
    const started = new Promise<void>(resolve => {
      drainStarted = resolve
    })
    registry.registerGlideMQInstance({
      close: () => {
        drainStarted()
        return draining
      },
    })
    registry.setSharedCommandClientShutdown(shared)

    const shutdownPromise = onGracefulShutdown()
    await started
    expect(shared).not.toHaveBeenCalled()

    releaseGlide()
    await shutdownPromise
    expect(shared).toHaveBeenCalledTimes(1)
  })

  it('propagates GlideMQ close failures after closing the shared command client', async () => {
    const { onGracefulShutdown, registry } = await loadShutdown()
    const error = new Error('glide close failed')
    const shared = vi.fn<() => void>()
    registry.registerGlideMQInstance({ close: () => Promise.reject(error) })
    registry.setSharedCommandClientShutdown(shared)

    await expect(onGracefulShutdown()).rejects.toMatchObject({
      name: 'AggregateError',
      message: 'Valkey shutdown failed',
      errors: [error],
    })
    expect(shared).toHaveBeenCalledTimes(1)
  })

  it('attempts every close and propagates all cleanup failures', async () => {
    const { onGracefulShutdown, registry } = await loadShutdown()
    const first = new Error('first glide close failed')
    const sharedError = new Error('shared client close failed')
    const second = { close: vi.fn<() => Promise<void>>(() => Promise.resolve()) }
    registry.registerGlideMQInstance({ close: () => Promise.reject(first) })
    registry.registerGlideMQInstance(second)
    registry.setSharedCommandClientShutdown(() => Promise.reject(sharedError))

    await expect(onGracefulShutdown()).rejects.toMatchObject({ errors: [first, sharedError] })
    expect(second.close).toHaveBeenCalledTimes(1)
  })

  it('converts non-Error close failures before reporting them', async () => {
    const { onGracefulShutdown, registry } = await loadShutdown()
    // Third-party close() implementations can reject with any value, not only an Error.
    const nonErrorReason = 'glide close failed' as unknown as Error
    registry.registerGlideMQInstance({
      close: () => Promise.reject(nonErrorReason),
    })

    await expect(onGracefulShutdown()).rejects.toMatchObject({
      errors: [expect.objectContaining({ message: 'glide close failed' })],
    })
  })
})
