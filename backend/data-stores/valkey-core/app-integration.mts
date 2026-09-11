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
type CacheCallMetricBridge = (metric: CacheCallMetric) => void

interface ValkeyAppIntegrationState {
  analyticsPromise: Promise<AnalyticsModule | null> | null
  bridge?: CacheCallMetricBridge
  loadAnalytics: ValkeyAnalyticsLoader
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

export function setValkeyAnalyticsLoaderForTest(loader: ValkeyAnalyticsLoader): void {
  const state = getValkeyAppIntegrationState()
  state.loadAnalytics = loader
  state.analyticsPromise = null
}

export function resetValkeyAnalyticsLoaderForTest(): void {
  setValkeyAnalyticsLoaderForTest(loadDefaultAnalytics)
}

export function getValkeyAnalyticsPromiseForTest(): Promise<AnalyticsModule | null> | null {
  return getValkeyAppIntegrationState().analyticsPromise
}

export function initializeValkeyAppIntegration(): void {
  const state = getValkeyAppIntegrationState()

  setValkeyErrorHandler(onError)

  state.bridge ??= emitValkeyCacheCallMetric
  markValkeyCacheMetricBridge(state.bridge)
  for (const listener of valkeyEvents.listeners('cache:call')) {
    if (isValkeyCacheMetricBridge(listener)) valkeyEvents.off('cache:call', listener)
  }
  valkeyEvents.on('cache:call', state.bridge)
}

function markValkeyCacheMetricBridge(bridge: CacheCallMetricBridge): CacheCallMetricBridge {
  const taggedBridge = bridge as unknown as Record<symbol, true>
  taggedBridge[valkeyCacheMetricBridgeKey] = true
  return bridge
}

function isValkeyCacheMetricBridge(listener: Function): listener is CacheCallMetricBridge {
  return (
    (listener as unknown as Record<symbol, true | undefined>)[valkeyCacheMetricBridgeKey] === true
  )
}

function emitValkeyCacheCallMetric(metric: CacheCallMetric): void {
  const state = getValkeyAppIntegrationState()
  const now = new Date()
  state.analyticsPromise ??= state.loadAnalytics().catch(error => {
    onError(error)
    return null
  })
  state.analyticsPromise
    .then(analytics => {
      if (!analytics) return
      analytics.emit('valkey_cache_calls', {
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
}

initializeValkeyAppIntegration()
