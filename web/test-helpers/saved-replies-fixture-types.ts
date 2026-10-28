import type { PageInfo } from '@/types/api-responses'

export interface SavedReply {
  id: string
  community_id: string
  title: string
  body: string
  order_index: number
  created_by_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface SavedRepliesResponseBody {
  results: SavedReply[]
  page_info: PageInfo
}
