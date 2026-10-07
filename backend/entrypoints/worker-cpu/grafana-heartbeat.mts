import { addGracefulShutdownCallback } from '@data-stores/graceful-shutdown'
import onError from '@modules/on-error'
import { getExternalFetch } from '@modules/utils'
import { sendGrafanaHeartbeat, validateHeartbeatUrl } from './grafana-heartbeat-request.mts'

const GRAFANA_HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000

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
    } catch (err) {
      if (!stopped) {
        dependencies.onError(err instanceof Error ? err : new Error(String(err)))
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
