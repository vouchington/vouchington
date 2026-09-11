'use client'

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth/context'
import { fetchPlaybackPosition, reportPlaybackPosition } from '@/lib/api/client/podcast-playback'
import { PodcastMiniPlayer } from './mini-player'
import { PodcastPlayerContext } from './use-podcast-player'
import type { PodcastEpisode } from './types'

const POSITION_REPORT_INTERVAL_MS = 12_000

function schedulePlaybackPositionReport(callback: () => void) {
  return setTimeout(callback, POSITION_REPORT_INTERVAL_MS)
}

export function PodcastPlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentEpisode, setCurrentEpisode] = useState<PodcastEpisode | null>(null)
  const [miniPlayerHeight, setMiniPlayerHeight] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const { isAuthenticated } = useAuth()
  const isAuthenticatedRef = useRef(isAuthenticated)
  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated
  }, [isAuthenticated])

  const reportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reportChainRef = useRef(Promise.resolve())
  const resumePositionRef = useRef<number | null>(null)
  const queueRef = useRef<PodcastEpisode[]>([])
  const clearTimer = useCallback(() => {
    if (reportTimerRef.current !== null) {
      clearTimeout(reportTimerRef.current)
      reportTimerRef.current = null
    }
  }, [])

  const doReport = useCallback(
    (episode: PodcastEpisode, positionSeconds: number, completed = false) => {
      const report = () =>
        isAuthenticatedRef.current
          ? reportPlaybackPosition(episode.episodeId, {
              position_seconds: positionSeconds,
              completed,
            }).catch(() => {})
          : Promise.resolve()
      const nextReport = reportChainRef.current.then(report, report)
      reportChainRef.current = nextReport.catch(() => {})
      return nextReport
    },
    [],
  )
  const reportFromEffect = useEffectEvent(doReport)
  const setQueue = useCallback((episodes: PodcastEpisode[]) => {
    queueRef.current = episodes
  }, [])

  const playEpisode = useCallback(
    (episode: PodcastEpisode) => {
      if (currentEpisode?.episodeId === episode.episodeId) {
        audioRef.current?.play().catch(() => {})
        return
      }
      if (!queueRef.current.some(e => e.episodeId === episode.episodeId)) {
        queueRef.current = [episode]
      }
      setCurrentEpisode(episode)
      resumePositionRef.current = null
    },
    [currentEpisode],
  )
  const clearEpisode = useCallback(() => {
    const audio = audioRef.current
    if (audio && currentEpisode && !audio.paused) {
      void doReport(currentEpisode, audio.currentTime)
    }
    if (audio) {
      audio.pause()
      audio.src = ''
    }
    clearTimer()
    setCurrentEpisode(null)
    setMiniPlayerHeight(null)
    resumePositionRef.current = null
  }, [clearTimer, currentEpisode, doReport])
  useEffect(() => {
    if (!currentEpisode || !isAuthenticatedRef.current) return
    let cancelled = false
    fetchPlaybackPosition(currentEpisode.episodeId)
      .then(pos => {
        if (cancelled) return
        const seekTime = pos && !pos.completed_at ? pos.position_seconds : 0
        resumePositionRef.current = seekTime
        const audio = audioRef.current
        if (audio && audio.readyState >= 1 && seekTime > 0) {
          const dur = Number.isFinite(audio.duration) ? audio.duration : Infinity
          audio.currentTime = Math.min(seekTime, Math.max(0, dur - 1))
          resumePositionRef.current = null
        }
      })
      .catch(() => {
        if (!cancelled) resumePositionRef.current = 0
      })
    return () => {
      cancelled = true
    }
  }, [currentEpisode])
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentEpisode) return

    function scheduleReport(episode: PodcastEpisode) {
      clearTimer()
      reportTimerRef.current = schedulePlaybackPositionReport(async () => {
        if (!audio!.paused) {
          await reportFromEffect(episode, audio!.currentTime)
          scheduleReport(episode)
        }
      })
    }

    function handleLoadedMetadata() {
      if (resumePositionRef.current !== null && resumePositionRef.current > 0) {
        const duration = Number.isFinite(audio!.duration) ? audio!.duration : Infinity
        audio!.currentTime = Math.min(resumePositionRef.current, Math.max(0, duration - 1))
        resumePositionRef.current = null
      }
    }
    function handlePlay() {
      scheduleReport(currentEpisode!)
    }
    function handlePause() {
      clearTimer()
      void reportFromEffect(currentEpisode!, audio!.currentTime)
    }
    function handleEnded() {
      if (!audio || !currentEpisode) return
      clearTimer()
      void reportFromEffect(currentEpisode, audio.currentTime, true)
      const queue = queueRef.current
      const idx = queue.findIndex(e => e.episodeId === currentEpisode.episodeId)
      const next = idx !== -1 ? queue[idx + 1] : undefined
      if (next) {
        setCurrentEpisode(next)
        resumePositionRef.current = null
      }
    }
    function handlePageHide() {
      if (!audio!.paused) void reportFromEffect(currentEpisode!, audio!.currentTime)
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)
    window.addEventListener('pagehide', handlePageHide)

    if (!audio.paused) scheduleReport(currentEpisode)

    return () => {
      audio.pause()
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
      window.removeEventListener('pagehide', handlePageHide)
      clearTimer()
    }
  }, [currentEpisode, clearTimer])
  const value = useMemo(
    () => ({ currentEpisode, miniPlayerHeight, playEpisode, clearEpisode, setQueue }),
    [currentEpisode, miniPlayerHeight, playEpisode, clearEpisode, setQueue],
  )

  return (
    <PodcastPlayerContext value={value}>
      {children}
      {currentEpisode ? (
        <PodcastMiniPlayer
          key={currentEpisode.episodeId}
          episode={currentEpisode}
          onClose={clearEpisode}
          audioRef={audioRef}
          onHeightChange={setMiniPlayerHeight}
        />
      ) : null}
    </PodcastPlayerContext>
  )
}
