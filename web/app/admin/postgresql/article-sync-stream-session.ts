import type { ArticleSyncJobStatus, ArticleSyncResult } from '@/lib/api/client/admin'
import { createRecoverableEventSource } from '@/lib/auth/recoverable-event-source'
import {
  createArticleSyncStreamRecovery,
  isTransientArticleSyncProbeError,
} from './article-sync-stream-recovery'

type SyncStream = ReturnType<typeof createRecoverableEventSource>
type SyncStatus =
  | { status: 'completed'; result: ArticleSyncResult }
  | { status: 'failed'; error?: string }
type TerminalArticleSyncStatus = Exclude<ArticleSyncJobStatus, { status: 'active' }>

/**
 * Keeps one article-sync EventSource attached to durable job status.
 * A permanently closed browser socket is replaced while the job stays active.
 * A source that is still reconnecting is left to native EventSource.
 */
export function createArticleSyncStreamSession(options: {
  readStatus: (jobId: string) => Promise<ArticleSyncJobStatus>
  onTerminal: (status: TerminalArticleSyncStatus | SyncStatus) => void
  onTrackingFailure: (error: unknown) => void
}) {
  let stream: SyncStream | null = null
  let activeJobId: string | null = null
  const recovery = createArticleSyncStreamRecovery(jobId => {
    void resumeClosedStream(jobId)
  })

  function endStream() {
    stream?.close()
    stream = null
  }

  function stop() {
    recovery.stop()
    activeJobId = null
    endStream()
  }

  function finish(status: TerminalArticleSyncStatus | SyncStatus, current: SyncStream) {
    if (stream !== current) return
    recovery.clear()
    activeJobId = null
    endStream()
    options.onTerminal(status)
  }

  function fail(current: SyncStream, error: unknown) {
    if (stream !== current) return
    recovery.clear()
    activeJobId = null
    endStream()
    options.onTrackingFailure(error)
  }

  async function resumeClosedStream(jobId: string) {
    if (activeJobId !== jobId) return
    try {
      const status = await options.readStatus(jobId)
      if (activeJobId !== jobId) return
      const current = stream
      if (!current) return
      if (status.status !== 'active') {
        finish(status, current)
        return
      }
      endStream()
      connect(jobId)
    } catch (err) {
      if (activeJobId !== jobId) return
      if (isTransientArticleSyncProbeError(err)) {
        recovery.schedule()
        return
      }
      const current = stream
      if (current) fail(current, err)
    }
  }

  function connect(jobId: string) {
    activeJobId = jobId
    recovery.arm(jobId)
    const current = createRecoverableEventSource({
      url: `/api/v1/admin/article-syncs/${jobId}/stream`,
      eventName: 'status',
      isCurrent: () => stream === current,
      onEvent: handleStatus,
      onError: handleError,
    })
    stream = current

    function handleStatus(event: MessageEvent) {
      let parsed: unknown
      const raw: unknown = event.data
      if (typeof raw !== 'string') return
      try {
        parsed = JSON.parse(raw)
      } catch {
        return
      }
      if (!isSyncStatus(parsed)) return
      const data: SyncStatus = parsed
      finish(data, current)
    }

    function handleError(source: EventSource) {
      if (!current.isCurrentSource(source)) return
      void options
        .readStatus(jobId)
        .then(status => {
          if (stream !== current || !current.isCurrentSource(source)) return
          if (status.status === 'active') {
            current.recoverClosed(source)
            if (current.isCurrentSource(source)) recovery.scheduleIfStillClosed(source, true)
            else recovery.clear()
            return
          }
          finish(status, current)
        })
        .catch((err: unknown) => {
          if (stream !== current || !current.isCurrentSource(source)) return
          if (isTransientArticleSyncProbeError(err)) {
            recovery.scheduleIfStillClosed(source, true)
            return
          }
          fail(current, err)
        })
    }
  }

  return {
    start(jobId: string) {
      stop()
      connect(jobId)
    },
    stop,
  }
}

function isSyncStatus(value: unknown): value is SyncStatus {
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
