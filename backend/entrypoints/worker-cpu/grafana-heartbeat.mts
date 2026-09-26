import { addGracefulShutdownCallback } from '@data-stores/graceful-shutdown'
import onError, { suppressSentryTracing } from '@modules/on-error'
import { getExternalFetch } from '@modules/utils'
import { context } from '@opentelemetry/api'
import { suppressTracing } from '@opentelemetry/core'

export const GRAFANA_HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000
export const GRAFANA_HEARTBEAT_TIMEOUT_MS = 5_000

type Timer = ReturnType<typeof setTimeout>
type ExternalFetch = ReturnType<typeof getExternalFetch>

type GrafanaHeartbeatDependencies = {
  fetch: ExternalFetch
  onError: typeof onError
  // Narrowed to the one overload startGrafanaHeartbeat actually calls (line 88): a callback
  // taking no arguments. typeof globalThis.setTimeout is the full overloaded signature, which a
  // vi.fn<>() mock can't satisfy without a cast — see grafana-heartbeat.test.mts.
  setTimeout: (callback: () => void, ms: number) => Timer
  clearTimeout: typeof globalThis.clearTimeout
  addGracefulShutdownCallback: typeof addGracefulShutdownCallback
}

const defaultDependencies = {
  fetch: getExternalFetch(),
  onError,
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  addGracefulShutdownCallback,
} satisfies GrafanaHeartbeatDependencies

function validateHeartbeatUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('GRAFANA_IRM_HEARTBEAT_URL must be an HTTPS grafana.net endpoint')
  }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.grafana.net')) {
    throw new Error('GRAFANA_IRM_HEARTBEAT_URL must be an HTTPS grafana.net endpoint')
  }
  return url
}

/* no-mistakes: integration=http */
export async function sendGrafanaHeartbeat(
  heartbeatUrl: string,
  requestFetch: ExternalFetch = defaultDependencies.fetch,
  signal?: AbortSignal,
): Promise<void> {
  const url = validateHeartbeatUrl(heartbeatUrl)
  // The Grafana IRM credential is embedded in the URL path. Suppress this one request in both
  // Sentry and OpenTelemetry so neither can export it as url.full.
  const response = await suppressSentryTracing(() =>
    context.with(suppressTracing(context.active()), () =>
      requestFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        redirect: 'error',
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(GRAFANA_HEARTBEAT_TIMEOUT_MS)])
          : AbortSignal.timeout(GRAFANA_HEARTBEAT_TIMEOUT_MS),
      }),
    ),
  )
  if (!response.ok) {
    throw new Error(`Grafana IRM heartbeat returned HTTP ${response.status}`)
  }
}

/**
 * Starts a process-local dead-man heartbeat for worker-cpu. This deliberately
 * does not use the universal heartbeat queue: worker-io could consume that
 * queue and mask a dead worker-cpu service.
 */
export function startGrafanaHeartbeat(
  heartbeatUrl = process.env.GRAFANA_IRM_HEARTBEAT_URL?.trim(),
  dependencies: GrafanaHeartbeatDependencies = defaultDependencies,
): () => void {
  if (!heartbeatUrl) return () => {}

  // Validate synchronously so a bad deployed secret is reported at startup.
  validateHeartbeatUrl(heartbeatUrl)

  let stopped = false
  let timer: Timer | undefined
  let activeRequest: AbortController | undefined
  let run: () => Promise<void>

  const scheduleNext = (): void => {
    if (stopped) return
    timer = dependencies.setTimeout(run, GRAFANA_HEARTBEAT_INTERVAL_MS)
    timer.unref?.()
  }

  run = async (): Promise<void> => {
    activeRequest = new AbortController()
    try {
      await sendGrafanaHeartbeat(heartbeatUrl, dependencies.fetch, activeRequest.signal)
    } catch (reason) {
      if (!stopped) {
        dependencies.onError(reason instanceof Error ? reason : new Error(String(reason)))
      }
    } finally {
      activeRequest = undefined
      scheduleNext()
    }
  }

  const stop = (): void => {
    if (stopped) return
    stopped = true
    if (timer) {
      dependencies.clearTimeout(timer)
      timer = undefined
    }
    activeRequest?.abort()
  }

  dependencies.addGracefulShutdownCallback(() => {
    stop()
    return Promise.resolve()
  })
  void run()
  return stop
}
