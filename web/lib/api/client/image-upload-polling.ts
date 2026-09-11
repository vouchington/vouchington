'use client'

import { getImageUploadState, type UploadStateResponse } from './image-upload-api'
import {
  InternalImageBlockedError,
  InternalImageProcessingTimeoutError,
} from './image-upload-errors'
import { getImageUploadRetryAfterMs } from './image-upload-retry-after'
import { ApiError } from '../error'

// Kept for backwards compatibility — callers that use these constants continue to work.
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 60_000
const POLL_MAX_ERRORS = 3

export {
  POLL_INTERVAL_MS as INTERNAL_POLL_INTERVAL_MS,
  POLL_MAX_ERRORS as INTERNAL_POLL_MAX_ERRORS,
  POLL_TIMEOUT_MS as INTERNAL_POLL_TIMEOUT_MS,
}

interface StreamOptions {
  timeoutMs?: number
  signal?: AbortSignal
}

/**
 * Opens an SSE connection to /api/v1/images/:id/state/stream and resolves when
 * the image reaches a terminal state (ready, blocked, or failed).
 *
 * Replaces the old polling loop.
 */
async function streamImageStateUntilTerminal(
  imageId: string,
  options: StreamOptions = {},
): Promise<UploadStateResponse> {
  return new Promise<UploadStateResponse>((resolve, reject) => {
    const es = new EventSource(`/api/v1/images/${imageId}/state/stream`)
    let settled = false
    let probeErrors = 0
    const timer: { id: ReturnType<typeof setTimeout> | undefined } = { id: undefined }
    const probeTimer: { id: ReturnType<typeof setTimeout> | undefined } = { id: undefined }
    let probeInFlight = false

    function settle(fn: () => void) {
      if (settled) return
      settled = true
      clearTimeout(timer.id)
      clearTimeout(probeTimer.id)
      options.signal?.removeEventListener('abort', onAbort)
      es.close()
      fn()
    }

    function applyState(state: UploadStateResponse) {
      probeErrors = 0
      if (state.blocked) {
        settle(() => reject(new InternalImageBlockedError(imageId)))
        return
      }
      if (state.ready) {
        settle(() => resolve(state))
        return
      }
      if (state.upload_status === 'failed') {
        settle(() => reject(new ApiError(state.upload_error ?? 'Image processing failed', 422)))
      }
    }

    function probeUploadState() {
      if (probeInFlight) return
      probeInFlight = true
      getImageUploadState(imageId, options.signal)
        .then(state => {
          if (settled) return
          applyState(state)
        })
        .catch(error => {
          if (settled) return
          if (error instanceof ApiError && error.status < 500 && error.status !== 429) {
            settle(() => reject(error))
            return
          }
          const retryAfterMs = getImageUploadRetryAfterMs(error)
          if (retryAfterMs !== null) {
            scheduleProbe(retryAfterMs)
            return
          }
          probeErrors += 1
          if (probeErrors >= POLL_MAX_ERRORS) {
            settle(() =>
              reject(error instanceof Error ? error : new Error('Image upload probe failed')),
            )
          }
        })
        .finally(() => {
          probeInFlight = false
        })
    }

    function scheduleProbe(delayMs: number) {
      clearTimeout(probeTimer.id)
      probeTimer.id = setTimeout(() => {
        if (!settled) probeUploadState()
      }, delayMs)
    }

    function onAbort() {
      settle(() => reject(new DOMException('Aborted', 'AbortError')))
    }

    if (options.signal?.aborted) {
      es.close()
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    options.signal?.addEventListener('abort', onAbort, { once: true })

    if (options.timeoutMs !== undefined) {
      timer.id = setTimeout(() => {
        settle(() => reject(new InternalImageProcessingTimeoutError(imageId)))
      }, options.timeoutMs)
    }

    es.addEventListener('state', (event: MessageEvent) => {
      let state: UploadStateResponse
      try {
        state = JSON.parse(event.data) as UploadStateResponse
      } catch {
        // Malformed event — wait for the next one.
        return
      }

      applyState(state)
    })

    es.addEventListener('error', (event: MessageEvent) => {
      // Named 'error' events dispatched by the server carry a `data` field.
      // Native EventSource connection errors also fire on this listener but have
      // no data — ignore them so the browser's built-in reconnect can take over.
      const raw = event.data
      if (!raw) return

      let errorMsg = 'Image processing failed'
      try {
        const data = JSON.parse(raw as string) as { error?: string }
        if (data.error) errorMsg = data.error
      } catch {
        // ignore parse errors for error events
      }
      settle(() => reject(new ApiError(errorMsg, 422)))
    })

    es.onerror = () => {
      if (settled) return
      probeUploadState()
      // Server-sent error events are handled by the 'error' listener above.
    }
  })
}

export { streamImageStateUntilTerminal as internalPollImageUntilTerminal }
