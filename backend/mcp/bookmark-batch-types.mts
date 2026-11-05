import type { ImportTopicResult } from '@services/user-import-export/import-topics'

export type BookmarkTarget = { entity_type: string; entity: string }

export type SetBookmarkArgs = {
  predicate: string
  targets: BookmarkTarget[]
  recommend_unknown_topics?: boolean
  idempotency_key?: string
}

type BookmarkRow = {
  id?: string
  subject_id: string
  object_id: string
  created_at: Date
  created_by_id: string
}

export type BookmarkTargetResult = {
  entity_type: string
  entity: string
  status: 'set' | 'error' | ImportTopicResult['status']
  bookmark?: BookmarkRow
  error_code?: 'RELATION_LIMIT_REACHED'
  error?: string
  entity_id?: string
  recommendation_post_id?: string
}
