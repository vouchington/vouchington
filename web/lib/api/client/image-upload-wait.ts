'use client'

import { ApiError } from '../error'
import { getImageUploadState } from './image-upload-api'
import {
  InternalImageBlockedError,
  InternalImageProcessingTimeoutError,
} from './image-upload-errors'
import {
  INTERNAL_POLL_INTERVAL_MS,
  INTERNAL_POLL_MAX_ERRORS,
  INTERNAL_POLL_TIMEOUT_MS,
} from './image-upload-polling'
import { getImageUploadRetryAfterMs } from './image-upload-retry-after'

export async function pollImageUntilUploaded(
  imageId: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
) {
  let timeoutAt = Date.now() + (options.timeoutMs ?? INTERNAL_POLL_TIMEOUT_MS)
  let errors = 0

  async function poll(): Promise<Awaited<ReturnType<typeof getImageUploadState>>> {
    const remainingMs = getRemainingMs(timeoutAt, imageId)
    throwIfAborted(options.signal)

    try {
      const request = createTimeoutSignal(options.signal, remainingMs)
      const state = await getImageUploadState(imageId, request.signal).finally(request.cleanup)
      errors = 0
      if (state.blocked) throw new InternalImageBlockedError(imageId)
      if (state.upload_status === 'failed') {
        throw new ApiError(state.upload_error ?? 'Image processing failed', 422)
      }
      if (state.upload_status === 'complete' || state.ready) return state
    } catch (error) {
      if (isAbortError(error)) {
        throwIfAborted(options.signal)
        throw new InternalImageProcessingTimeoutError(imageId)
      }
      if (!(error instanceof ApiError) || (error.status < 500 && error.status !== 429)) throw error
      const retryAfterMs = getImageUploadRetryAfterMs(error)
      if (retryAfterMs !== null) {
        timeoutAt += retryAfterMs
        await delay(retryAfterMs, options.signal)
        return poll()
      }
      errors += 1
      if (errors >= INTERNAL_POLL_MAX_ERRORS) throw error
    }

    await delay(
      Math.min(INTERNAL_POLL_INTERVAL_MS, getRemainingMs(timeoutAt, imageId)),
      options.signal,
    )
    return poll()
  }

  return poll()
}

function getRemainingMs(timeoutAt: number, imageId: string): number {
  const remainingMs = timeoutAt - Date.now()
  if (remainingMs <= 0) throw new InternalImageProcessingTimeoutError(imageId)
  return remainingMs
}

function createTimeoutSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => {
    clearTimeout(timeout)
    controller.abort()
  }

  signal?.addEventListener('abort', onAbort, { once: true })

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

/* c8 ignore next 2 -- V8 can mark the private helper signature uncovered; polling tests cover the body. */
function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timeout = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}
