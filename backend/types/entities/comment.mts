export type CommentSort = 'new' | 'best'

export type CommentTreeOptions = {
  max_depth?: number
  sort?: CommentSort
  after?: string // Base64-encoded cursor
  // Internal cursor parameters (decoded from 'after', used by query builder)
  id_lt?: string
  vote_score_lt?: number
  published_before?: number
}

export type CommentRow = {
  __entity_type: 'post'
  id: string
  post_type: string
  root_id: string | null
  parent_id: string | null
  deleted_at: Date | null
  created_at: Date | null
  community_id: string | null
  vote_score: number | null
  depth: number
}

export type CommentNode = {
  __entity_type: 'post'
  id: string
  post_type: string
  root_id: string | null
  parent_id: string | null
  deleted_at: Date | null
  community_id: string | null
  children: CommentNode[]
}
