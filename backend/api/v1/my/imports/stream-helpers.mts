import type { ApiSseEvent } from '@vouchington/utils/api-response-contract'
import type { ImportProgressSubscription, ImportProgressChunk } from '@data-stores/valkey-pubsub'
import { getRssFeedImportSummary } from '@services/user-import-export/rss-feed-imports'

export type ImportStreamEvent =
  | ApiSseEvent<'progress', ImportProgressChunk>
  | ApiSseEvent<'done', Record<string, never>>

// Max ~4 progress frames/sec; terminal done frame is always sent immediately
export const THROTTLE_INTERVAL_MS = 250
const RSS_IMPORT_POLL_INTERVAL_MS = 2_000

export async function pipeUserRssFeedImportProgressToSSE(options: {
  batchId: string
  userId: string
  initialImport: NonNullable<Awaited<ReturnType<typeof getRssFeedImportSummary>>>
  emit: (event: ImportStreamEvent) => void
  disconnectSignal: AbortSignal
  pollIntervalMs?: number
  readImport?: typeof getRssFeedImportSummary
}): Promise<void> {
  const pollIntervalMs = options.pollIntervalMs ?? RSS_IMPORT_POLL_INTERVAL_MS
  const readImport = options.readImport ?? getRssFeedImportSummary

  async function poll(
    current: NonNullable<Awaited<ReturnType<typeof getRssFeedImportSummary>>>,
  ): Promise<void> {
    if (options.disconnectSignal.aborted) return

    const chunk = {
      batchId: options.batchId,
      completed: current.completed_rows,
      failed: current.failed_rows,
      total: current.total_rows,
      done: current.pending_rows === 0 || current.completed_at !== null,
    }

    options.emit({ event: 'progress', data: chunk })
    if (chunk.done) {
      options.emit({ event: 'done', data: {} })
      return
    }

    await waitForNextPoll(options.disconnectSignal, pollIntervalMs)
    if (!options.disconnectSignal.aborted) {
      await poll((await readImport(options.userId, options.batchId)) ?? current)
    }
  }

  await poll(options.initialImport)
}

function waitForNextPoll(signal: AbortSignal, pollIntervalMs: number): Promise<void> {
  if (signal.aborted) return Promise.resolve()

  return new Promise(resolve => {
    const timer = setTimeout(settle, pollIntervalMs)
    function settle() {
      clearTimeout(timer)
      signal.removeEventListener('abort', settle)
      // Clearing the alternate signal makes this first-winner-only
      resolve()
    }
    signal.addEventListener('abort', settle, { once: true })
  })
}

export function pipeImportProgressToSSE(options: {
  subscription: ImportProgressSubscription
  emit: (event: ImportStreamEvent) => void
  disconnectSignal: AbortSignal
  throttleIntervalMs: number
}): Promise<void> {
  const { subscription, emit, disconnectSignal, throttleIntervalMs } = options

  if (disconnectSignal.aborted) return Promise.resolve()

  return new Promise<void>(resolve => {
    let settled = false
    let pendingChunk: ImportProgressChunk | null = null
    const flushTimer: { id: ReturnType<typeof setInterval> | undefined } = { id: undefined }

    function settle(): void {
      if (settled) return
      settled = true
      clearInterval(flushTimer.id)
      disconnectSignal.removeEventListener('abort', settle)
      subscription.setHandler(null)
      // `settled` guards competing disconnect and completion signals
      resolve()
    }

    function flushPending(): void {
      if (!pendingChunk || settled) return
      const chunk = pendingChunk
      pendingChunk = null
      try {
        emit({ event: 'progress', data: chunk })
      } catch {
        // client gone
      }
    }

    // Throttled flush interval
    flushTimer.id = setInterval(flushPending, throttleIntervalMs)

    disconnectSignal.addEventListener('abort', settle, { once: true })
    if (disconnectSignal.aborted) {
      settle()
      return
    }

    subscription.setHandler((chunk: ImportProgressChunk) => {
      if (settled) return
      pendingChunk = chunk
      if (chunk.done) {
        flushPending()
        try {
          emit({ event: 'done', data: {} })
        } catch {
          // client gone
        }
        settle()
      }
    })
  })
}
