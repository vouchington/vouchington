import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sentryCaptureExceptionMock as captureException } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { valkeyEvents } from 'valkyries'
import { initializeValkeyAppIntegration } from './app-integration.mts'

type EmittedAnalyticsEvent = [string, Record<string, unknown>]
const metric = { cacheName: 'u', batch: false, hits: 0, misses: 1, bloomMisses: 0, durationMs: 1 }
function emitCacheMetric(cacheName: string, overrides: Partial<typeof metric> = {}) {
  valkeyEvents.emit('cache:call', { ...metric, ...overrides, cacheName })
}

type IntegrationState = {
  analyticsPromise: Promise<typeof import('@data-stores/analytics') | null> | null
  loadAnalytics: () => Promise<typeof import('@data-stores/analytics')>
  bridge?: (metric: unknown) => void
}
const integrationStateKey = Symbol.for('voucha.valkey.app-integration')
function getIntegrationState(): IntegrationState {
  const state = (globalThis as Record<symbol, IntegrationState | undefined>)[integrationStateKey]
  if (!state) throw new Error('Expected Valkey app integration to be initialized')
  return state
}
let ownedLoads: NonNullable<IntegrationState['analyticsPromise']>[] = []
let waitForCacheMetricCompletions: () => Promise<void>
function useAnalyticsLoader(loader: IntegrationState['loadAnalytics']) {
  const state = getIntegrationState()
  if (state.analyticsPromise) ownedLoads.push(state.analyticsPromise)
  state.loadAnalytics = loader
  state.analyticsPromise = null
}

function createAnalyticsLoader(
  emitted: EmittedAnalyticsEvent[],
  emit: (event: string, payload: Record<string, unknown>) => void | Promise<void> = (
    event,
    payload,
  ) => void emitted.push([event, payload]),
) {
  return async () => ({ emit }) as unknown as typeof import('@data-stores/analytics')
}

describe('valkey app integration', () => {
  let originalState: IntegrationState
  let originalListeners: ReturnType<typeof valkeyEvents.listeners<'cache:call'>>
  beforeEach(() => {
    originalState = { ...getIntegrationState() }
    originalListeners = valkeyEvents.listeners('cache:call')
    ownedLoads = []
    getIntegrationState().analyticsPromise = null
    valkeyEvents.removeAllListeners('cache:call')
    waitForCacheMetricCompletions = initializeValkeyAppIntegration().waitForCacheMetricCompletions
  })

  afterEach(async () => {
    const state = getIntegrationState()
    if (state.analyticsPromise) ownedLoads.push(state.analyticsPromise)
    await Promise.allSettled(ownedLoads)
    await waitForCacheMetricCompletions()
    Object.assign(state, originalState)
    valkeyEvents.removeAllListeners('cache:call')
    for (const listener of originalListeners) valkeyEvents.on('cache:call', listener)
  })

  it('preserves its bridge identity while initializing cache metric forwarding', async () => {
    const emitted: EmittedAnalyticsEvent[] = []
    const cacheName = `users-${crypto.randomUUID()}`
    useAnalyticsLoader(createAnalyticsLoader(emitted))

    const bridge = getIntegrationState().bridge
    initializeValkeyAppIntegration()
    expect(getIntegrationState().bridge).toBe(bridge)

    emitCacheMetric(cacheName, { batch: true, hits: 1, misses: 0 })

    await waitForCacheMetricCompletions()
    expect(emitted.filter(([, payload]) => payload.cache_name === cacheName)).toHaveLength(1)
  })

  it('bridges cache metrics into analytics events', async () => {
    const emitted: EmittedAnalyticsEvent[] = []
    const cacheName = `users-${crypto.randomUUID()}`
    useAnalyticsLoader(createAnalyticsLoader(emitted))

    emitCacheMetric(cacheName, { batch: true, hits: 3, bloomMisses: 2, durationMs: 12.5 })

    await waitForCacheMetricCompletions()
    expect(emitted.filter(([, payload]) => payload.cache_name === cacheName)).toHaveLength(1)

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
    useAnalyticsLoader(createAnalyticsLoader(emitted))

    initializeValkeyAppIntegration()
    initializeValkeyAppIntegration()
    emitCacheMetric(cacheName, { hits: 1, misses: 0, durationMs: 2 })

    await waitForCacheMetricCompletions()
    expect(emitted.filter(([, payload]) => payload.cache_name === cacheName)).toHaveLength(1)
  })

  it('collapses duplicate cache metric bridge listeners', async () => {
    const integrationState = getIntegrationState()
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
    const bridgeKey = Symbol.for('voucha.valkey.cache-metric-bridge')
    const integrationState = getIntegrationState()
    const staleBridge = integrationState?.bridge
    expect(staleBridge).toBeTypeOf('function')
    if (!staleBridge) throw new Error('Expected cache metric bridge to be initialized')

    useAnalyticsLoader(createAnalyticsLoader(emitted))
    valkeyEvents.removeAllListeners('cache:call')
    delete (staleBridge as unknown as Record<symbol, true | undefined>)[bridgeKey]
    valkeyEvents.on('cache:call', staleBridge)

    initializeValkeyAppIntegration()
    emitCacheMetric(cacheName, { batch: true, hits: 4, misses: 0, bloomMisses: 1, durationMs: 8 })

    await waitForCacheMetricCompletions()
    expect(emitted.filter(([, payload]) => payload.cache_name === cacheName)).toHaveLength(1)

    expect(
      valkeyEvents.listeners('cache:call').filter(listener => listener === staleBridge),
    ).toHaveLength(1)
    expect((staleBridge as unknown as Record<symbol, true | undefined>)[bridgeKey]).toBe(true)
  })

  it('removes stale cache metric bridge listener identities', async () => {
    const bridgeKey = Symbol.for('voucha.valkey.cache-metric-bridge')
    const staleBridge = vi.fn<(metric: unknown) => void>()
    ;(staleBridge as unknown as Record<symbol, true>)[bridgeKey] = true
    valkeyEvents.on('cache:call', staleBridge)

    initializeValkeyAppIntegration()

    emitCacheMetric('users', { batch: true, hits: 1, misses: 0 })

    expect(staleBridge).not.toHaveBeenCalled()
    const integrationState = getIntegrationState()
    expect(valkeyEvents.listeners('cache:call')).toEqual([integrationState?.bridge])
  })

  it('reinstalls the cache metric bridge when listeners were cleared', async () => {
    const emitted: EmittedAnalyticsEvent[] = []
    const cacheName = `posts-${crypto.randomUUID()}`
    useAnalyticsLoader(createAnalyticsLoader(emitted))

    valkeyEvents.removeAllListeners('cache:call')
    initializeValkeyAppIntegration()
    initializeValkeyAppIntegration()
    emitCacheMetric(cacheName, { hits: 2, durationMs: 3 })

    await waitForCacheMetricCompletions()
    expect(emitted.filter(([, payload]) => payload.cache_name === cacheName)).toHaveLength(1)
  })

  it('forwards cache metrics through the original analytics loader', async () => {
    useAnalyticsLoader(originalState.loadAnalytics)
    const analytics = await originalState.loadAnalytics()
    const emitSpy = vi.spyOn(analytics, 'emit')
    const cacheName = `default-loader-${crypto.randomUUID()}`
    try {
      vi.stubEnv('ANALYTICS_BACKEND', 'disabled')
      emitCacheMetric(cacheName)
      await waitForCacheMetricCompletions()
      expect(emitSpy).toHaveBeenCalledWith(
        'valkey_cache_calls',
        expect.objectContaining({ cache_name: cacheName }),
      )
    } finally {
      emitSpy.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it('routes valkyries error handling through onError', async () => {
    const { handleValkeyError } = await import('valkyries')
    const error = new Error('valkey bridge failure')

    handleValkeyError(error)

    expect(captureException).toHaveBeenCalledWith(error, expect.anything())
  })

  it('routes analytics import failures through onError', async () => {
    const error = new Error('analytics import failed')
    useAnalyticsLoader(() => Promise.reject(error))

    emitCacheMetric('users')

    await waitForCacheMetricCompletions()
    expect(captureException).toHaveBeenCalledWith(error, expect.anything())
  })

  it('clears rejected metric completions after error reporting fails', async () => {
    const emitError = new Error('analytics emit failed')
    const reportingError = new Error('Sentry capture failed')
    const failureReported = Promise.withResolvers<void>()
    const delayed = Promise.withResolvers<void>()
    const delayedFinished = Promise.withResolvers<void>()
    captureException.mockImplementation(() => {
      failureReported.resolve()
      throw reportingError
    })
    useAnalyticsLoader(
      createAnalyticsLoader([], (_event, payload) =>
        payload.cache_name === 'u'
          ? Promise.reject(emitError)
          : delayed.promise.then(() => delayedFinished.resolve()),
      ),
    )
    emitCacheMetric('u')
    emitCacheMetric('delayed')
    const completions = waitForCacheMetricCompletions()
    const completionOutcome = completions.then(
      () => undefined,
      err => err,
    )
    let settled = false
    void completions.then(
      () => (settled = true),
      () => (settled = true),
    )
    await failureReported.promise
    delayed.resolve()
    await delayedFinished.promise
    expect(settled).toBe(false)
    expect(await completionOutcome).toBe(reportingError)
    expect(captureException).toHaveBeenCalledWith(emitError, expect.anything())
    await expect(waitForCacheMetricCompletions()).resolves.toBeUndefined()
  })
})
