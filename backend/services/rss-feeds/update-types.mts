import type { QueryOptions } from '@data-stores/psql'

export type UpdateRssFeedChanges = {
  rss_feed_url?: string
  topic_id?: string
  title?: string | null
  enabled?: boolean
  discoverable?: boolean
  etag?: string | null
  last_modified_at?: Date | true | null
  last_fetched_at?: Date | true
  feed_type?: 'article' | 'podcast' | 'video' | 'mixed'
  declared_language?: string | null
  ignore_robots_txt?: boolean | null
  unreliable_status_codes?: number[] | null
}

export type UpdateRssFeedOptions = QueryOptions & {
  stateChangeReason?: string
  preserveHttp?: boolean
}
