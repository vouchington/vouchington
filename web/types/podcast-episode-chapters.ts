export interface PodcastEpisodeChapter {
  start_seconds: number
  end_seconds: number | null
  title: string
  url: string | null
  image_url: string | null
  is_visible: boolean
}

export interface PodcastEpisodeChaptersResponseBody {
  chapters: PodcastEpisodeChapter[]
}
