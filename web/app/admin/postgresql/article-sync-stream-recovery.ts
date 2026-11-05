import { ApiError } from '@vouchington/api-client'

/** Wait before replacing an article-sync stream the browser has permanently closed. */
export const ARTICLE_SYNC_STREAM_REATTACH_MS = 2_000

export function isTransientArticleSyncProbeError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true
  return error.status >= 500 || error.status === 429
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
