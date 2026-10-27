import { ApiError } from '@vouchington/api-client'

const MAX_CLOSED_PROBE_RETRIES = 2
const CLOSED_PROBE_RETRY_MS = 1_000

function isTransientStatusProbeError(error: unknown): boolean {
  if (error instanceof ApiError)
    return error.status === 408 || error.status === 429 || error.status >= 500
  return (
    error instanceof TypeError || (error instanceof DOMException && error.name === 'NetworkError')
  )
}

export function createClosedStatusProbeRetry() {
  let attempts = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  return {
    get pending() {
      return timer !== undefined
    },
    handleFailure(error: unknown, source: EventSource, probe: () => void): boolean {
      if (error instanceof Error && error.name === 'AbortError') return true
      if (!isTransientStatusProbeError(error)) return false
      if (source.readyState !== EventSource.CLOSED) return true
      if (attempts >= MAX_CLOSED_PROBE_RETRIES) return false
      attempts++
      timer = setTimeout(() => {
        timer = undefined
        probe()
      }, CLOSED_PROBE_RETRY_MS)
      return true
    },
    reset() {
      attempts = 0
    },
    clear() {
      if (timer) clearTimeout(timer)
      timer = undefined
    },
  }
}
