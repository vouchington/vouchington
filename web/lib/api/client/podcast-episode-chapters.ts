'use client'

import { clientApi } from './instance'

export type PodcastEpisodeChapter = {
  start_seconds: number
  end_seconds: number | null
  title: string
  url: string | null
  image_url: string | null
  is_visible: boolean
}

export type PodcastEpisodeChaptersResponse = {
  chapters: PodcastEpisodeChapter[]
}

export async function fetchPodcastEpisodeChapters(
  episodeId: string,
): Promise<PodcastEpisodeChaptersResponse> {
  return clientApi.get<PodcastEpisodeChaptersResponse>(
    `/api/v1/podcast-episodes/${encodeURIComponent(episodeId)}/chapters`,
  )
}
