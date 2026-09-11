import type { Post } from '@/types/posts'
import type { CommentNodeData } from './comment-tree-utils'

export interface CommentNodeProps {
  node: CommentNodeData
  depth: number
  rootPostId: string
  rootPostType: string
  collapsedIds: Set<string>
  replyToId: string | null
  quoteMarkdown: string
  onToggleCollapse: (id: string) => void
  onToggleReply: (id: string | null) => void
  onCommentAdded: (parentId: string, comment: Post, html?: string) => void
  onQuote: (comment: Post) => void
  isAdmin: boolean
  isThreadLocked: boolean
  hideDownCount?: boolean
}
