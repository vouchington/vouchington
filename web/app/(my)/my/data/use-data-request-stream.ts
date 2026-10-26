'use client'

import { useEffect, useEffectEvent } from 'react'
import { ApiError } from '@vouchington/api-client'
import type { DataRequest } from '@/lib/api/client/users'
import { createDownloadLinkRetry, needsDownloadLinkRetry } from './data-request-download-link-retry'
import { loadDataRequest, type StreamPayload } from './data-request-utils'

const TERMINAL_STATUSES = new Set(['ready', 'failed', 'expired'])

interface UseDataRequestStreamOptions {
  userId: string
  request: DataRequest | null
  applyRequest: (data: DataRequest | null) => void
  setError: (error: string | null) => void
}

function shouldKeepStreamReconnecting(request: DataRequest | null): boolean {
  return !request || request.status === 'pending' || request.status === 'processing'
}

export function useDataRequestStream({
  userId,
  request,
  applyRequest,
  setError,
}: UseDataRequestStreamOptions): void {
  const currentRequest = useEffectEvent(() => request)
  const matchesCurrentIdentity = useEffectEvent(
    (streamUserId: string, streamRequestId: string) =>
      userId === streamUserId && request?.id === streamRequestId,
  )
  const applyCurrentRequest = useEffectEvent(applyRequest)
  const setCurrentError = useEffectEvent(setError)

  const requestId = request?.id
  const isStreamActive = Boolean(
    request && (request.status === 'pending' || request.status === 'processing'),
  )

  useEffect(() => {
    if (!isStreamActive) return

    let active = true
    const isCurrent = () => active && matchesCurrentIdentity(userId, requestId!)
    const downloadLinkRetry = createDownloadLinkRetry({
      isCurrent,
      load: () => loadDataRequest(userId),
      apply: updated => applyCurrentRequest(updated),
      setError: message => setCurrentError(message),
    })

    const streamUrl = `/api/v1/users/${userId}/data-request/stream?request_id=${encodeURIComponent(requestId!)}`
    let reopenedWithoutEvent = false
    let stream = openStream()

    function openStream() {
      const source = new EventSource(streamUrl)
      const onError = () => onSseError(source)
      const onOpen = () => {
        if (isCurrent() && stream.source === source) reopenedWithoutEvent = false
      }
      source.addEventListener('status', onStatus as EventListener)
      source.addEventListener('error', onError)
      source.addEventListener('open', onOpen)
      return { source, onError, onOpen }
    }

    function closeStream(value: ReturnType<typeof openStream>) {
      value.source.removeEventListener('status', onStatus as EventListener)
      value.source.removeEventListener('error', value.onError)
      value.source.removeEventListener('open', value.onOpen)
      value.source.close()
    }

    function onStatus(event: MessageEvent) {
      if (!isCurrent()) return
      reopenedWithoutEvent = false
      let data: StreamPayload
      try {
        data = JSON.parse(event.data) as StreamPayload
      } catch {
        return
      }

      loadDataRequest(userId)
        .then(updated => {
          if (!isCurrent()) return
          applyStreamUpdate(data, updated)
        })
        .catch(() => {
          if (isCurrent()) applyStreamFallback(data)
        })
    }

    function applyStreamUpdate(data: StreamPayload, updated: DataRequest | null) {
      if (TERMINAL_STATUSES.has(data.status) && shouldKeepStreamReconnecting(updated)) {
        applyTerminalPayload(data)
        return
      }
      if (needsDownloadLinkRetry(updated)) {
        downloadLinkRetry.schedule()
        return
      }
      applyCurrentRequest(
        updated && data.download_url && !updated.download_url
          ? { ...updated, download_url: data.download_url }
          : updated,
      )
    }

    function applyTerminalPayload(data: StreamPayload) {
      if (data.status === 'ready' && !data.download_url) {
        downloadLinkRetry.schedule()
        return
      }
      const latestRequest = currentRequest()
      if (!latestRequest) return
      applyCurrentRequest({
        ...latestRequest,
        status: data.status as DataRequest['status'],
        download_url: data.download_url ?? latestRequest.download_url,
      })
      if (data.status === 'failed') setCurrentError('Your data export failed. Please try again.')
      else setCurrentError(null)
    }

    function applyStreamFallback(data: StreamPayload) {
      const latestRequest = currentRequest()
      if (!latestRequest) return
      if (data.status === 'failed') {
        applyCurrentRequest({ ...latestRequest, status: data.status as DataRequest['status'] })
        setCurrentError('Your data export failed. Please try again.')
      } else if (data.status === 'ready' && !data.download_url) {
        downloadLinkRetry.schedule()
      } else {
        applyCurrentRequest({
          ...latestRequest,
          status: data.status as DataRequest['status'],
          download_url: data.download_url ?? latestRequest.download_url,
        })
        setCurrentError(null)
      }
    }

    // Any `error` event — a bare connection drop or the server's named timeout event
    // (the stream cycles on a short cap; see docs/development/runtime-timeouts.md) — is
    // recovered from durable state, not treated as user-facing failure. `EventSource`
    // reconnects natively as long as `close()` is not called, so a routine cycle stays warm.
    function onSseError(source: EventSource) {
      if (!isCurrent() || stream.source !== source) return
      loadDataRequest(userId)
        .then(updated => {
          if (!isCurrent() || stream.source !== source) return
          // `!updated` (e.g. a 404 — the export was deleted mid-stream) falls through to the
          // same no-op as pending/processing: EventSource keeps reconnecting with no user-visible
          // feedback. Accepted trade-off, not an oversight — pre-dates this change.
          if (shouldKeepStreamReconnecting(updated)) {
            // A 401 closes native EventSource permanently. The successful status probe above
            // has recovered authentication, so replace only a closed stream. An ordinary drop
            // stays CONNECTING and retains the browser's built-in reconnect behavior.
            if (updated && source.readyState === EventSource.CLOSED && !reopenedWithoutEvent) {
              reopenedWithoutEvent = true
              closeStream(stream)
              stream = openStream()
            }
            return
          }
          if (needsDownloadLinkRetry(updated)) {
            downloadLinkRetry.schedule()
            return
          }
          applyCurrentRequest(updated)
          closeStream(stream)
        })
        .catch(err => {
          if (!isCurrent() || stream.source !== source) return
          if (!(err instanceof ApiError) || err.status >= 500 || err.status === 429) return
          setCurrentError('Failed to track export status. Please refresh.')
          closeStream(stream)
        })
    }

    return () => {
      active = false
      closeStream(stream)
      downloadLinkRetry.clear()
    }
  }, [isStreamActive, requestId, userId])
}
