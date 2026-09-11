'use client'

import { useEffect, useState } from 'react'
import {
  fetchPodcastEpisodeChapters,
  type PodcastEpisodeChapter,
} from '@/lib/api/client/podcast-episode-chapters'

type VisibleChapterState = {
  episodeId: string
  chapters: PodcastEpisodeChapter[]
}

export function useVisibleChapters(episodeId: string): PodcastEpisodeChapter[] {
  const [state, setState] = useState<VisibleChapterState | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchPodcastEpisodeChapters(episodeId)
      .then(({ chapters }) => {
        if (!cancelled) {
          setState({ episodeId, chapters: chapters.filter(chapter => chapter.is_visible) })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ episodeId, chapters: [] })
        }
      })
    return () => {
      cancelled = true
    }
  }, [episodeId])

  return state?.episodeId === episodeId ? state.chapters : []
}
