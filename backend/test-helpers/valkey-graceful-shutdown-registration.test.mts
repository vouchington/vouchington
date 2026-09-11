import { beforeEach, describe, expect, it, vi } from 'vitest'

const targetEntrypoints = [
  { name: '@data-stores/valkey-pubsub', load: () => import('@data-stores/valkey-pubsub') },
  {
    name: '@data-stores/valkey-rate-limiter',
    load: () => import('@data-stores/valkey-rate-limiter'),
  },
  { name: '@data-stores/valkey-glide-mq', load: () => import('@data-stores/valkey-glide-mq') },
  {
    name: '@data-stores/valkey-glide-mq/glide-mq-factory',
    // Direct subpath consumers bypass the package root but must still register shutdown.
    load: () => import('@data-stores/valkey-glide-mq/glide-mq-factory'),
  },
] as const

describe('valkey graceful shutdown registration', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it.each(targetEntrypoints)('registers shutdown when $name is imported', async ({ load }) => {
    const gracefulShutdown = await import('@data-stores/graceful-shutdown')

    expect(gracefulShutdown.isGracefulShutdownValkeyRegistered()).toBe(false)

    await load()

    expect(gracefulShutdown.isGracefulShutdownValkeyRegistered()).toBe(true)
  })
})
