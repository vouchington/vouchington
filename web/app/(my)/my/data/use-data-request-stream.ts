'use client'

import { useEffect, useRef } from 'react'
import { ApiError } from '@/lib/api/error'
import type { DataRequest } from '@/lib/api/client/users'
import { loadDataRequest, type StreamPayload } from './data-request-utils'

const DOWNLOAD_LINK_RETRY_DELAY_MS = 5000
const DOWNLOAD_LINK_RETRY_LIMIT = 3
const TERMINAL_STATUSES = new Set(['ready', 'failed', 'expired'])

interface UseDataRequestStreamOptions {
  userId: string
  request: DataRequest | null
  applyRequest: (data: DataRequest | null) => void
  setError: (error: string | null) => void
}

function needsDownloadLinkRetry(request: DataRequest | null): boolean {
  return request?.status === 'ready' && !request.download_url
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
  const esRef = useRef<EventSource | null>(null)
  const downloadLinkRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const downloadLinkRetryCountRef = useRef(0)
  const requestRef = useRef(request)
  requestRef.current = request

  function clearDownloadLinkRetry() {
    if (downloadLinkRetryRef.current !== null) {
      clearTimeout(downloadLinkRetryRef.current)
      downloadLinkRetryRef.current = null
    }
    downloadLinkRetryCountRef.current = 0
  }

  function scheduleDownloadLinkRetry() {
    if (downloadLinkRetryRef.current !== null) return
    if (downloadLinkRetryCountRef.current >= DOWNLOAD_LINK_RETRY_LIMIT) {
      setError('Your export is ready but the download link could not be fetched. Please refresh.')
      return
    }
    downloadLinkRetryCountRef.current += 1
    downloadLinkRetryRef.current = setTimeout(() => {
      downloadLinkRetryRef.current = null
      loadDataRequest(userId)
        .then(updated => {
          if (needsDownloadLinkRetry(updated)) {
            scheduleDownloadLinkRetry()
            return
          }
          clearDownloadLinkRetry()
          applyRequest(updated)
        })
        .catch(() => scheduleDownloadLinkRetry())
    }, DOWNLOAD_LINK_RETRY_DELAY_MS)
  }

  const requestId = request?.id
  const isStreamActive = Boolean(
    request && (request.status === 'pending' || request.status === 'processing'),
  )

  useEffect(() => {
    if (!isStreamActive) {
      esRef.current?.close()
      esRef.current = null
      clearDownloadLinkRetry()
      return
    }

    const es = new EventSource(
      `/api/v1/users/${userId}/data-request/stream?request_id=${encodeURIComponent(requestId!)}`,
    )
    esRef.current = es

    function onStatus(event: MessageEvent) {
      let data: StreamPayload
      try {
        data = JSON.parse(event.data) as StreamPayload
      } catch {
        return
      }

      loadDataRequest(userId)
        .then(updated => {
          applyStreamUpdate(data, updated)
        })
        .catch(() => applyStreamFallback(data))
    }

    function applyStreamUpdate(data: StreamPayload, updated: DataRequest | null) {
      if (TERMINAL_STATUSES.has(data.status) && shouldKeepStreamReconnecting(updated)) {
        applyTerminalPayload(data)
        return
      }
      if (needsDownloadLinkRetry(updated)) {
        scheduleDownloadLinkRetry()
        return
      }
      applyRequest(
        updated && data.download_url && !updated.download_url
          ? { ...updated, download_url: data.download_url }
          : updated,
      )
    }

    function applyTerminalPayload(data: StreamPayload) {
      if (data.status === 'ready' && !data.download_url) {
        scheduleDownloadLinkRetry()
        return
      }
      const currentRequest = requestRef.current
      if (!currentRequest) return
      applyRequest({
        ...currentRequest,
        status: data.status as DataRequest['status'],
        download_url: data.download_url ?? currentRequest.download_url,
      })
      if (data.status === 'failed') setError('Your data export failed. Please try again.')
      else setError(null)
    }

    function applyStreamFallback(data: StreamPayload) {
      const currentRequest = requestRef.current
      if (!currentRequest) return
      if (data.status === 'failed') {
        applyRequest({ ...currentRequest, status: data.status as DataRequest['status'] })
        setError('Your data export failed. Please try again.')
      } else if (data.status === 'ready' && !data.download_url) {
        scheduleDownloadLinkRetry()
      } else {
        applyRequest({
          ...currentRequest,
          status: data.status as DataRequest['status'],
          download_url: data.download_url ?? currentRequest.download_url,
        })
        setError(null)
      }
    }

    // Any `error` event — a bare connection drop or the server's named timeout event
    // (the stream cycles on a short cap; see docs/development/runtime-timeouts.md) — is
    // recovered from durable state, not treated as user-facing failure. `EventSource`
    // reconnects natively as long as `close()` is not called, so a routine cycle stays warm.
    function onSseError() {
      loadDataRequest(userId)
        .then(updated => {
          // `!updated` (e.g. a 404 — the export was deleted mid-stream) falls through to the
          // same no-op as pending/processing: EventSource keeps reconnecting with no user-visible
          // feedback. Accepted trade-off, not an oversight — pre-dates this change.
          if (shouldKeepStreamReconnecting(updated)) return
          if (needsDownloadLinkRetry(updated)) {
            scheduleDownloadLinkRetry()
            return
          }
          applyRequest(updated)
          es.close()
        })
        .catch(error => {
          if (!(error instanceof ApiError) || error.status >= 500 || error.status === 429) return
          setError('Failed to track export status. Please refresh.')
          es.close()
        })
    }

    es.addEventListener('status', onStatus)
    es.addEventListener('error', onSseError as EventListener)

    return () => {
      es.removeEventListener('status', onStatus)
      es.removeEventListener('error', onSseError as EventListener)
      es.close()
      clearDownloadLinkRetry()
      esRef.current = null
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- retry helpers use refs and the current userId from this effect
  }, [isStreamActive, requestId, userId])
}
