import type { IncomingMessage } from 'node:http'

/**
 * Abort reason the API SSE helper gives a cycle that reached its duration bound, and the job signal
 * name the API sends a worker for the same event. It is an external protocol between the API and
 * worker signals, so the wire value must not change.
 */
export const SSE_CYCLE_EXPIRED = 'sse-cycle-expired'

/** Server-owned SSE cycle shared by API routes and the GlideMQ dashboard event stream. */
export const DEFAULT_SSE_CYCLE_DURATION_MS = 60_000
export const MAX_SSE_CYCLE_DURATION_MS = 120_000

const DASHBOARD_EVENT_STREAM_PATH = '/api/events'

type DashboardEventRequest = Pick<IncomingMessage, 'method' | 'url'>

type DashboardEventResponse = {
  destroyed: boolean
  writableEnded: boolean
  end: () => void
  once: (event: 'close' | 'finish', listener: () => void) => void
}

export function assertSseCycleDuration(cycleDurationMs: number): void {
  if (cycleDurationMs > MAX_SSE_CYCLE_DURATION_MS) {
    throw new RangeError(`SSE cycle duration must not exceed ${MAX_SSE_CYCLE_DURATION_MS} ms`)
  }
}

function dashboardEventStreamPath(url = ''): string {
  const queryIndex = url.indexOf('?')
  return queryIndex === -1 ? url : url.slice(0, queryIndex)
}

/**
 * Ends the GlideMQ dashboard event stream when its cycle elapses. Writes nothing, so the page's
 * EventSource treats the close like any dropped connection and reconnects. Other dashboard routes
 * are left untouched.
 */
export function armDashboardEventStream(
  request: DashboardEventRequest,
  response: DashboardEventResponse,
  cycleDurationMs = DEFAULT_SSE_CYCLE_DURATION_MS,
): void {
  assertSseCycleDuration(cycleDurationMs)
  if (
    request.method !== 'GET' ||
    dashboardEventStreamPath(request.url) !== DASHBOARD_EVENT_STREAM_PATH
  ) {
    return
  }
  if (response.writableEnded || response.destroyed) return

  const timer = setTimeout(() => {
    if (!response.writableEnded && !response.destroyed) response.end()
  }, cycleDurationMs)
  timer.unref()

  const stop = () => {
    clearTimeout(timer)
  }
  response.once('close', stop)
  response.once('finish', stop)
}
