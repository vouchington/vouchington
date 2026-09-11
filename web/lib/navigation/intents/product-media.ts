import type { NavIntent } from './types'
import { NEWS_INTENT } from './product-media-news'
import { PODCASTS_INTENT } from './product-media-podcasts'
import { VIDEOS_INTENT } from './product-media-videos'

export const PRODUCT_MEDIA_INTENTS: readonly NavIntent[] = [
  NEWS_INTENT,
  PODCASTS_INTENT,
  VIDEOS_INTENT,
]
