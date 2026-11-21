'use client'

import { useEffect, useEffectEvent } from 'react'

/** First wait before replacing a stream the browser has permanently closed. */
export const SNAPSHOT_STREAM_REATTACH_BASE_MS = 5_000
export const SNAPSHOT_STREAM_REATTACH_MAX_MS = 60_000

type SnapshotStreamOptions = {
  url: string
  /** REST poll cadence while the snapshot stream is not delivering. */
  fallbackIntervalMs: number
  /** Handles one `snapshot` event; call `stopFallback` once it supersedes REST polling. */
  onSnapshot: (event: MessageEvent, stopFallback: () => void) => void
  /** One REST refresh; `shouldApply` turns false once a stream snapshot supersedes it. */
  loadFallback: (shouldApply: () => boolean) => unknown
}

/**
 * Keeps an admin `snapshot` EventSource attached with REST polling as the stopgap. Routine server
 * cycles are native reconnects. When the browser permanently closes the stream (a non-200 during
 * a Spot reclaim or deploy), it is replaced with capped backoff until a snapshot arrives.
 */
export function useSnapshotStream(options: SnapshotStreamOptions): void {
  const handleSnapshot = useEffectEvent(options.onSnapshot)
  const loadFallback = useEffectEvent(options.loadFallback)
  const { url, fallbackIntervalMs } = options

  useEffect(() => {
    const fallback = { interval: null as ReturnType<typeof setInterval> | null, generation: 0 }
    let reattachTimer: ReturnType<typeof setTimeout> | undefined
    let reattachFailures = 0
    let current: EventSource

    function runRestFallback() {
      const generation = fallback.generation
      loadFallback(() => generation === fallback.generation)
    }

    function startRestFallback() {
      if (fallback.interval !== null) return
      runRestFallback()
      fallback.interval = setInterval(runRestFallback, fallbackIntervalMs)
    }

    function stopRestFallback() {
      fallback.generation += 1
      if (fallback.interval !== null) {
        clearInterval(fallback.interval)
        fallback.interval = null
      }
    }

    function scheduleReattach(closed: EventSource) {
      if (reattachTimer !== undefined || current !== closed) return
      const delay = Math.min(
        SNAPSHOT_STREAM_REATTACH_BASE_MS * 2 ** reattachFailures,
        SNAPSHOT_STREAM_REATTACH_MAX_MS,
      )
      reattachFailures += 1
      reattachTimer = setTimeout(() => {
        reattachTimer = undefined
        closed.close()
        current = open()
      }, delay)
    }

    function open(): EventSource {
      const source = new EventSource(url)
      source.addEventListener('snapshot', event => {
        reattachFailures = 0
        handleSnapshot(event as MessageEvent, stopRestFallback)
      })
      source.onerror = () => {
        startRestFallback()
        if (source.readyState === EventSource.CLOSED) scheduleReattach(source)
      }
      return source
    }

    current = open()

    return () => {
      if (reattachTimer !== undefined) clearTimeout(reattachTimer)
      current.close()
      stopRestFallback()
    }
  }, [url, fallbackIntervalMs])
}
