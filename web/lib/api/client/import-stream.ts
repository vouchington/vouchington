'use client'

import { ApiError } from '../error'
import { parseErrorResponseBody } from '../error-helpers'
import type { RssFeedImportStatus } from './import-export'

export interface ImportProgress {
  batchId: string
  completed: number
  failed: number
  total: number
  done: boolean
}

/** Consecutive transient poll failures tolerated while a task is replaced (Spot, deploy). */
export const IMPORT_POLL_MAX_TRANSIENT_ERRORS = 3

function isTransientPollError(err: unknown, retryNotFound: boolean): boolean {
  if (err instanceof ApiError) {
    return err.status >= 500 || err.status === 429 || (retryNotFound && err.status === 404)
  }
  return err instanceof TypeError
}

export async function streamImportProgress(
  importId: string,
  onProgress: (progress: ImportProgress) => void,
  signal?: AbortSignal,
  onCompleted?: (status: RssFeedImportStatus) => void,
): Promise<void> {
  const fetchProgress = async () => {
    const response = await fetch(`/api/v1/my/import/rss-feeds/${encodeURIComponent(importId)}`, {
      credentials: 'include',
      signal,
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      throw new ApiError(
        'Import status failed',
        response.status,
        await parseErrorResponseBody(response),
      )
    }

    const body = (await response.json()) as RssFeedImportStatus
    const progress = {
      batchId: body.import.id,
      completed: body.import.completed_rows,
      failed: body.import.failed_rows,
      total: body.import.total_rows,
      done: body.import.pending_rows === 0 || body.import.completed_at !== null,
    }
    onProgress(progress)
    if (progress.done) onCompleted?.(body)
    return progress.done
  }

  let transientErrors = 0
  const poll = async (retryNotFound = false): Promise<boolean> => {
    try {
      const done = await fetchProgress()
      transientErrors = 0
      return done
    } catch (err) {
      if (!isTransientPollError(err, retryNotFound)) throw err
      transientErrors += 1
      if (transientErrors >= IMPORT_POLL_MAX_TRANSIENT_ERRORS) throw err
      return false
    }
  }

  // The initial read may reach a replica before the import creation is visible.
  if (signal?.aborted || (await poll(true))) return

  await new Promise<void>((resolve, reject) => {
    let inFlight = false
    const state: { interval?: ReturnType<typeof setInterval> } = {}
    const onAbort = () => {
      clearInterval(state.interval)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    state.interval = setInterval(() => {
      if (inFlight) return
      inFlight = true
      poll()
        .then(done => {
          inFlight = false
          if (!done) return
          clearInterval(state.interval)
          signal?.removeEventListener('abort', onAbort)
          resolve()
        })
        .catch((err: unknown) => {
          clearInterval(state.interval)
          signal?.removeEventListener('abort', onAbort)
          reject(err instanceof Error ? err : new Error('Import stream failed'))
        })
    }, 2000)
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}
