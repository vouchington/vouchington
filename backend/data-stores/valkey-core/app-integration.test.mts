import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sentryCaptureExceptionMock as captureException } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { valkeyEvents } from 'valkyries'
import {
  getValkeyAnalyticsPromiseForTest,
  initializeValkeyAppIntegration,
  resetValkeyAnalyticsLoaderForTest,
  setValkeyAnalyticsLoaderForTest,
} from './app-integration.mts'

type EmittedAnalyticsEvent = [string, Record<string, unknown>]

function createAnalyticsLoader(emitted: EmittedAnalyticsEvent[]) {
  return async () =>
    ({
      emit(event: string, payload: Record<string, unknown>) {
        emitted.push([event, payload])
      },
    }) as typeof import('@data-stores/analytics')
}

describe('valkey app integration', () => {
  beforeEach(() => {
    valkeyEvents.removeAllListeners('cache:call')
    initializeValkeyAppIntegration()
  })

  afterEach(() => {
    resetValkeyAnalyticsLoaderForTest()
    valkeyEvents.removeAllListeners('cache:call')
  })

  it('registers cache metric forwarding once across module resets', async () => {
    const emitted: EmittedAnalyticsEvent[] = []
    const cacheName = `users-${crypto.randomUUID()}`
    setValkeyAnalyticsLoaderForTest(createAnalyticsLoader(emitted))

    vi.resetModules()
    const { setValkeyAnalyticsLoaderForTest: setReloadedValkeyAnalyticsLoaderForTest } =
      await import('./app-integration.mts')
    setReloadedValkeyAnalyticsLoaderForTest(createAnalyticsLoader(emitted))

    valkeyEvents.emit('cache:call', {
      cacheName,
      batch: true,
      hits: 1,
      misses: 0,
      bloomMisses: 0,
      durationMs: 1,
    })

    await vi.waitFor(() => {
      expect(emitted.filter(([, payload]) => payload.cache_name === cacheName)).toHaveLength(1)
    })

    resetValkeyAnalyticsLoaderForTest()
  })

  it('bridges cache metrics into analytics events', async () => {
    const emitted: EmittedAnalyticsEvent[] = []
    const cacheName = `users-${crypto.randomUUID()}`
    setValkeyAnalyticsLoaderForTest(createAnalyticsLoader(emitted))

    valkeyEvents.emit('cache:call', {
      cacheName,
      batch: true,
      hits: 3,
      misses: 1,
      bloomMisses: 2,
      durationMs: 12.5,
    })

    await vi.waitFor(() => {
      expect(emitted.filter(([, payload]) => payload.cache_name === cacheName)).toHaveLength(1)
    })

    const [event, payload] = emitted.find(([, entry]) => entry.cache_name === cacheName)!
    expect(event).toBe('valkey_cache_calls')
    expect(payload).toEqual(
      expect.objectContaining({
        cache_name: cacheName,
        batch: true,
        hits: 3,
        misses: 1,
        bloom_misses: 2,
        duration_ms: 12.5,
        env: process.env.NODE_ENV ?? 'development',
        event_id: expect.any(String),
        event_time: expect.any(Date),
        event_date: expect.any(String),
      }),
    )
  })

  it('does not duplicate cache metric bridges when initialized repeatedly', async () => {
    const emitted: EmittedAnalyticsEvent[] = []
    const cacheName = `topics-${crypto.randomUUID()}`
    setValkeyAnalyticsLoaderForTest(createAnalyticsLoader(emitted))

    initializeValkeyAppIntegration()
    initializeValkeyAppIntegration()
    valkeyEvents.emit('cache:call', {
      cacheName,
      batch: false,
      hits: 1,
      misses: 0,
      bloomMisses: 0,
      durationMs: 2,
    })

    await vi.waitFor(() => {
      expect(emitted.filter(([, payload]) => payload.cache_name === cacheName)).toHaveLength(1)
    })
  })

  it('collapses duplicate cache metric bridge listeners', async () => {
    const integrationStateKey = Symbol.for('voucha.valkey.app-integration')
    const integrationState = (globalThis as Record<symbol, { bridge?: (metric: unknown) => void }>)[
      integrationStateKey
    ]
    const bridge = integrationState?.bridge
    expect(bridge).toBeTypeOf('function')
    if (!bridge) throw new Error('Expected cache metric bridge to be initialized')

    valkeyEvents.on('cache:call', bridge)
    expect(
      valkeyEvents.listeners('cache:call').filter(listener => listener === bridge),
    ).toHaveLength(2)

    initializeValkeyAppIntegration()

    expect(
      valkeyEvents.listeners('cache:call').filter(listener => listener === bridge),
    ).toHaveLength(1)
  })

  it('re-tags a pre-existing untagged cache metric bridge before deduping', async () => {
    const emitted: EmittedAnalyticsEvent[] = []
    const cacheName = `orders-${crypto.randomUUID()}`
    const integrationStateKey = Symbol.for('voucha.valkey.app-integration')
    const bridgeKey = Symbol.for('voucha.valkey.cache-metric-bridge')
    const integrationState = (globalThis as Record<symbol, { bridge?: (metric: unknown) => void }>)[
      integrationStateKey
    ]
    const staleBridge = integrationState?.bridge
    expect(staleBridge).toBeTypeOf('function')
    if (!staleBridge) throw new Error('Expected cache metric bridge to be initialized')

    setValkeyAnalyticsLoaderForTest(createAnalyticsLoader(emitted))
    valkeyEvents.removeAllListeners('cache:call')
    delete (staleBridge as unknown as Record<symbol, true | undefined>)[bridgeKey]
    valkeyEvents.on('cache:call', staleBridge)

    initializeValkeyAppIntegration()
    valkeyEvents.emit('cache:call', {
      cacheName,
      batch: true,
      hits: 4,
      misses: 0,
      bloomMisses: 1,
      durationMs: 8,
    })

    await vi.waitFor(() => {
      expect(emitted.filter(([, payload]) => payload.cache_name === cacheName)).toHaveLength(1)
    })

    expect(
      valkeyEvents.listeners('cache:call').filter(listener => listener === staleBridge),
    ).toHaveLength(1)
    expect((staleBridge as unknown as Record<symbol, true | undefined>)[bridgeKey]).toBe(true)
  })

  it('removes stale cache metric bridge listener identities', async () => {
    const integrationStateKey = Symbol.for('voucha.valkey.app-integration')
    const bridgeKey = Symbol.for('voucha.valkey.cache-metric-bridge')
    const staleBridge = vi.fn<(metric: unknown) => void>()
    ;(staleBridge as unknown as Record<symbol, true>)[bridgeKey] = true
    valkeyEvents.on('cache:call', staleBridge)

    initializeValkeyAppIntegration()

    valkeyEvents.emit('cache:call', {
      cacheName: 'users',
      batch: true,
      hits: 1,
      misses: 0,
      bloomMisses: 0,
      durationMs: 1,
    })

    expect(staleBridge).not.toHaveBeenCalled()
    const integrationState = (globalThis as Record<symbol, { bridge?: (metric: unknown) => void }>)[
      integrationStateKey
    ]
    expect(valkeyEvents.listeners('cache:call')).toEqual([integrationState?.bridge])
  })

  it('reinstalls the cache metric bridge when listeners were cleared', async () => {
    const emitted: EmittedAnalyticsEvent[] = []
    const cacheName = `posts-${crypto.randomUUID()}`
    setValkeyAnalyticsLoaderForTest(createAnalyticsLoader(emitted))

    valkeyEvents.removeAllListeners('cache:call')
    initializeValkeyAppIntegration()
    initializeValkeyAppIntegration()
    valkeyEvents.emit('cache:call', {
      cacheName,
      batch: false,
      hits: 2,
      misses: 1,
      bloomMisses: 0,
      durationMs: 3,
    })

    await vi.waitFor(() => {
      expect(emitted.filter(([, payload]) => payload.cache_name === cacheName)).toHaveLength(1)
    })
  })

  it('uses the default analytics loader after test loader reset', async () => {
    resetValkeyAnalyticsLoaderForTest()

    valkeyEvents.emit('cache:call', {
      cacheName: 'users',
      batch: false,
      hits: 0,
      misses: 1,
      bloomMisses: 0,
      durationMs: 1,
    })

    const analytics = await getValkeyAnalyticsPromiseForTest()
    expect(analytics?.emit).toEqual(expect.any(Function))
  })

  it('routes valkyries error handling through onError', async () => {
    const { handleValkeyError } = await import('valkyries')
    const error = new Error('valkey bridge failure')

    handleValkeyError(error)

    expect(captureException).toHaveBeenCalledWith(error, expect.anything())
  })

  it('routes analytics import failures through onError', async () => {
    const error = new Error('analytics import failed')
    setValkeyAnalyticsLoaderForTest(() => Promise.reject(error))

    valkeyEvents.emit('cache:call', {
      cacheName: 'users',
      batch: false,
      hits: 0,
      misses: 1,
      bloomMisses: 0,
      durationMs: 1,
    })

    await vi.waitFor(() => {
      expect(captureException).toHaveBeenCalledWith(error, expect.anything())
    })
  })
})
