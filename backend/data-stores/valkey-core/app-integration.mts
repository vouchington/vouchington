import onError from '@modules/on-error'
import { setValkeyErrorHandler, valkeyEvents } from 'valkyries'

type AnalyticsModule = typeof import('@data-stores/analytics')
type ValkeyAnalyticsLoader = () => Promise<AnalyticsModule>
type CacheCallMetric = {
  batch: boolean
  bloomMisses: number
  cacheName: string
  durationMs: number
  hits: number
  misses: number
}
type CacheCallMetricBridge = (metric: CacheCallMetric) => Promise<void>

interface ValkeyAppIntegrationState {
  analyticsPromise: Promise<AnalyticsModule | null> | null
  bridge?: CacheCallMetricBridge
  loadAnalytics: ValkeyAnalyticsLoader
  pendingMetricCompletions?: Set<Promise<void>>
}

const valkeyAppIntegrationStateKey = Symbol.for('voucha.valkey.app-integration')
const valkeyCacheMetricBridgeKey = Symbol.for('voucha.valkey.cache-metric-bridge')
const globalState = globalThis as Record<symbol, ValkeyAppIntegrationState | undefined>

function loadDefaultAnalytics(): Promise<AnalyticsModule> {
  return import('@data-stores/analytics')
}

function getValkeyAppIntegrationState(): ValkeyAppIntegrationState {
  globalState[valkeyAppIntegrationStateKey] ??= {
    analyticsPromise: null,
    loadAnalytics: loadDefaultAnalytics,
  }
  return globalState[valkeyAppIntegrationStateKey]
}

export function initializeValkeyAppIntegration(): {
  waitForCacheMetricCompletions: () => Promise<void>
} {
  const state = getValkeyAppIntegrationState()

  setValkeyErrorHandler(onError)

  state.bridge ??= emitValkeyCacheCallMetric
  markValkeyCacheMetricBridge(state.bridge)
  for (const listener of valkeyEvents.listeners('cache:call')) {
    if (isValkeyCacheMetricBridge(listener)) valkeyEvents.off('cache:call', listener)
  }
  valkeyEvents.on('cache:call', state.bridge)
  return { waitForCacheMetricCompletions: waitForValkeyCacheMetricCompletions }
}

/** Waits until all cache-call analytics events emitted so far finish loading and dispatching. */
async function waitForValkeyCacheMetricCompletions(): Promise<void> {
  const pending = getValkeyAppIntegrationState().pendingMetricCompletions
  if (!pending) return
  const completions = await Promise.allSettled([...pending])
  const failedCompletion = completions.find(completion => completion.status === 'rejected')
  if (failedCompletion?.status === 'rejected') throw failedCompletion.reason
}

function markValkeyCacheMetricBridge(bridge: CacheCallMetricBridge): CacheCallMetricBridge {
  const taggedBridge = bridge as unknown as Record<symbol, true>
  taggedBridge[valkeyCacheMetricBridgeKey] = true
  return bridge
}

function isValkeyCacheMetricBridge(
  listener: (...args: never[]) => unknown,
): listener is CacheCallMetricBridge {
  return (
    (listener as unknown as Record<symbol, true | undefined>)[valkeyCacheMetricBridgeKey] === true
  )
}

function emitValkeyCacheCallMetric(metric: CacheCallMetric): Promise<void> {
  const state = getValkeyAppIntegrationState()
  if (!state.pendingMetricCompletions) state.pendingMetricCompletions = new Set()
  const pending = state.pendingMetricCompletions
  const now = new Date()
  state.analyticsPromise ??= state.loadAnalytics().catch(err => {
    onError(err)
    return null
  })
  const completion = state.analyticsPromise
    .then(analytics => {
      if (!analytics) return undefined
      return analytics.emit('valkey_cache_calls', {
        event_id: crypto.randomUUID(),
        event_time: now,
        event_date: now.toISOString().slice(0, 10),
        env: process.env.NODE_ENV ?? 'development',
        cache_name: metric.cacheName,
        batch: metric.batch,
        hits: metric.hits,
        misses: metric.misses,
        bloom_misses: metric.bloomMisses,
        duration_ms: metric.durationMs,
      })
    })
    .catch(onError)
  pending.add(completion)
  void completion.then(
    () => pending.delete(completion),
    () => pending.delete(completion),
  )
  return completion
}

initializeValkeyAppIntegration()
