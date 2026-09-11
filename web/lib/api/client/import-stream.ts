'use client'

import { ApiError } from '../error'
import { parseErrorResponseBody } from '../error-helpers'

export interface ImportProgress {
  batchId: string
  completed: number
  failed: number
  total: number
  done: boolean
}

export async function streamImportProgress(
  importId: string,
  onProgress: (progress: ImportProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const poll = async () => {
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

    const body = (await response.json()) as {
      import: {
        id: string
        completed_rows: number
        failed_rows: number
        total_rows: number
        pending_rows: number
        completed_at: string | null
      }
    }
    const progress = {
      batchId: body.import.id,
      completed: body.import.completed_rows,
      failed: body.import.failed_rows,
      total: body.import.total_rows,
      done: body.import.pending_rows === 0 || body.import.completed_at !== null,
    }
    onProgress(progress)
    return progress.done
  }

  if (signal?.aborted || (await poll())) return

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
        .catch((error: unknown) => {
          clearInterval(state.interval)
          signal?.removeEventListener('abort', onAbort)
          reject(error instanceof Error ? error : new Error('Import stream failed'))
        })
    }, 2000)
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}
