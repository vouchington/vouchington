import type { BasicUser } from '@services/users/types'

type CrawlerType = 'fetch' | 'automation'

type CrawlerBasic = {
  __entity_type: 'crawler'
  id: string
  hostname_id: string
  description: string
  crawler_type: CrawlerType
  priority: number
  css_selectors_to_remove: string[]
  link_text_content_to_remove: string[]
  link_hrefs_to_remove: string[]
  content_selectors: string[]
  referral_program_id: string | null
  created_at: Date
  updated_at: Date
}

export type Crawler = CrawlerBasic & {
  created_by: BasicUser | null
  updated_by: BasicUser | null
  deleted_by: BasicUser | null
  deleted_at: Date | null
}

export type CreateCrawlerUpdates = {
  hostname_id: string
  description?: string
  crawler_type: CrawlerType
  priority?: number
  css_selectors_to_remove?: string[]
  link_text_content_to_remove?: string[]
  link_hrefs_to_remove?: string[]
  content_selectors?: string[]
  referral_program_id?: string | null
}

export type UpdateCrawlerUpdates = {
  hostname_id?: string
  description?: string
  crawler_type?: CrawlerType
  priority?: number
  css_selectors_to_remove?: string[]
  link_text_content_to_remove?: string[]
  link_hrefs_to_remove?: string[]
  content_selectors?: string[]
  referral_program_id?: string | null
}
