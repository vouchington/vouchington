import type {
  CommentNode,
  CommentRow,
  CommentSort,
  CommentTreeOptions,
} from '@voucha/types/entities/comment'

export function detectCommentSort(options: CommentTreeOptions): CommentSort {
  return options.sort ?? 'new'
}

export function mapCommentRow(row: CommentRow): CommentNode {
  return {
    __entity_type: 'post',
    id: row.id,
    post_type: row.post_type,
    root_id: row.root_id,
    parent_id: row.parent_id,
    deleted_at: row.deleted_at,
    community_id: row.community_id,
    children: [],
  }
}
