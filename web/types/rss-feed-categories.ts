import type { PageInfo } from '@voucha/types/pagination'

export type UnmappedCategoryStatus = 'pending' | 'rejected' | 'all'

export interface UnmappedCategory {
  category_text: string
  item_count: number
  rejected: boolean
}

export interface UnmappedCategoryListResponse {
  results: UnmappedCategory[]
  page_info: PageInfo
}
