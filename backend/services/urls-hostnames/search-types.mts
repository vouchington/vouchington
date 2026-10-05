export type SearchUrlHostnamesOptions = {
  query?: string
  hostname?: string
  topic_id?: string
  topic_ids?: string[]
  topic_match?: 'any' | 'all'
  include_descendants?: boolean
  is_blocked?: boolean | number | string
  is_crawlable?: boolean | number | string
  limit?: number
  sort?: 'trust'
  after?: string
}
