export type TopicMetrics = {
  __entity_type: 'topic_metrics'
  id: string
  count: {
    discussions: number
    reviews: number
    'data-points': number
    news: number
    latest: number
  }
  // Present when the count was read through the profile count cap. True means the stored
  // number is the cap and the real total is larger.
  count_capped?: {
    discussions: boolean
    reviews: boolean
    'data-points': boolean
    news: boolean
    latest: boolean
  }
  viewer_count?: {
    discussions: number
    reviews: number
    'data-points': number
  }
  // Viewer flags also mark bounded input exhaustion: counts are lower bounds, including zero.
  viewer_count_capped?: {
    [Key in keyof NonNullable<TopicMetrics['viewer_count']>]: boolean
  }
  ratings: {
    count: {
      '1': number
      '2': number
      '3': number
      '4': number
      '5': number
    }
  }
  ratings__updated_at: Date | null
  bookmarks: {
    follow: number
  }
  bookmarks__updated_at: Date | null
}

export type TopicRatingStats = {
  ratings__score__1: number
  ratings__score__2: number
  ratings__score__3: number
  ratings__score__4: number
  ratings__score__5: number
  ratings__count__1: number
  ratings__count__2: number
  ratings__count__3: number
  ratings__count__4: number
  ratings__count__5: number
}
