import { ApiError } from '@vouchington/api-client'
import type { ArticleSyncResult } from '@/lib/api/client/admin'

export type ArticleSyncStreamStatus =
  | { status: 'completed'; result: ArticleSyncResult }
  | { status: 'failed'; error?: string }

/** Wait before replacing an article-sync stream the browser has permanently closed. */
export const ARTICLE_SYNC_STREAM_REATTACH_MS = 2_000

export function isTransientArticleSyncProbeError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true
  return error.status >= 500 || error.status === 429
}

export function parseArticleSyncStreamStatus(raw: unknown): ArticleSyncStreamStatus | null {
  if (typeof raw !== 'string') return null
  try {
    const value: unknown = JSON.parse(raw)
    return isArticleSyncStreamStatus(value) ? value : null
  } catch {
    return null
  }
}

function isArticleSyncStreamStatus(value: unknown): value is ArticleSyncStreamStatus {
  if (!isRecord(value)) return false
  if (value.status === 'failed') return !('error' in value) || typeof value.error === 'string'
  if (value.status !== 'completed' || !isRecord(value.result)) return false
  const { results, summary } = value.result
  return (
    Array.isArray(results) &&
    results.every(
      item =>
        isRecord(item) &&
        typeof item.file === 'string' &&
        typeof item.slug === 'string' &&
        (item.action === 'created' ||
          item.action === 'updated' ||
          item.action === 'skipped' ||
          item.action === 'error') &&
        (!('error' in item) || typeof item.error === 'string'),
    ) &&
    isRecord(summary) &&
    typeof summary.created === 'number' &&
    typeof summary.updated === 'number' &&
    typeof summary.skipped === 'number' &&
    typeof summary.errored === 'number'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Schedules one follow-up while a sync stays active after the browser permanently closes the
 * stream. Native reconnect is left alone: a source that is not closed can still deliver events.
 */
export function createArticleSyncStreamRecovery(continueJob: (jobId: string) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let jobId: string | undefined
  let stopped = false

  function clear() {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
  }

  function schedule() {
    if (timer !== undefined || stopped || jobId === undefined) return
    const scheduledJobId = jobId
    timer = setTimeout(() => {
      timer = undefined
      if (stopped || jobId !== scheduledJobId) return
      continueJob(scheduledJobId)
    }, ARTICLE_SYNC_STREAM_REATTACH_MS)
  }

  return {
    arm(nextJobId: string) {
      stopped = false
      jobId = nextJobId
      clear()
    },
    stop() {
      stopped = true
      jobId = undefined
      clear()
    },
    clear,
    schedule,
    scheduleIfStillClosed(source: EventSource, stillCurrent: boolean) {
      if (!stillCurrent || source.readyState !== EventSource.CLOSED) return
      schedule()
    },
  }
}
