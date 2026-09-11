'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CommentNode } from './comment-node'
import { CommentReplyForm } from './comment-reply-form'
import { buildQuoteMarkdown } from './comment-tree-utils'
import { useCommentTreeState } from './use-comment-tree-state'
import { useAuth } from '@/lib/auth/context'
import type { CommentTreeViewModel } from './comment-tree-view-model'
import type { Post } from '@/types/posts'
import { useTranslations } from '@/lib/i18n/use-translations'

interface CommentTreeProps {
  data: CommentTreeViewModel
  rootPostId: string
  rootPostType: string
  rootLockedAt: string | null
  isAdmin: boolean
  hideDownCount: boolean
}

export function CommentTree({
  data,
  rootPostId,
  rootPostType,
  rootLockedAt,
  isAdmin,
  hideDownCount,
}: CommentTreeProps) {
  const t = useTranslations()
  const { currentUser } = useAuth()
  const currentUserId = currentUser?.id ?? null
  const comments = useCommentTreeState({ currentUserId, data, isAdmin, rootPostId })
  const isThreadLocked = rootLockedAt != null

  function handleQuote(comment: Post) {
    if (isThreadLocked || comment.locked_at != null) return
    comments.setQuoteMarkdown(buildQuoteMarkdown(comment, rootPostType, rootPostId))
    comments.setReplyToId(comment.id)
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h2
          className='text-lg font-semibold'
          data-pw='comments-heading'
        >
          {t('extracted.comments.commentTree.comments_355f79f2')}
        </h2>
        <Select
          value={comments.sort}
          onValueChange={value => comments.setSort(value as 'new' | 'best')}
        >
          <SelectTrigger
            aria-label={t('extracted.comments.commentTree.sortComments_dc63c010')}
            className='h-11 w-32 sm:h-9'
            data-pw='comments-sort-trigger'
          >
            <SelectValue placeholder={t('extracted.comments.commentTree.sort_bec69036')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value='best'
              data-pw='comments-sort-option-best'
            >
              {t('extracted.comments.commentTree.best_c47d21c6')}
            </SelectItem>
            <SelectItem
              value='new'
              data-pw='comments-sort-option-new'
            >
              {t('extracted.comments.commentTree.new_18fdd549')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!isThreadLocked && (
        <CommentReplyForm
          key='root-reply'
          parentId={rootPostId}
          rootId={rootPostId}
          onSuccess={(comment, html) => comments.handleCommentAdded(rootPostId, comment, html)}
          placeholder={t('extracted.comments.commentTree.whatAreYourThoughts_3c9256e9')}
          initialMarkdown=''
          dataPw='root-comment-textarea'
        />
      )}

      <div className='space-y-1'>
        {comments.commentNodes.map(node => (
          <CommentNode
            key={`${node.post.id}:${node.post.locked_at ?? ''}:${node.post.locked_by_id ?? ''}`}
            node={node}
            depth={0}
            rootPostId={rootPostId}
            rootPostType={rootPostType}
            collapsedIds={comments.collapsedIds}
            replyToId={comments.replyToId}
            quoteMarkdown={comments.quoteMarkdown}
            onToggleCollapse={comments.handleToggleCollapse}
            onToggleReply={id => {
              comments.setReplyToId(id)
              comments.setQuoteMarkdown('')
            }}
            onCommentAdded={comments.handleCommentAdded}
            onQuote={handleQuote}
            isAdmin={isAdmin}
            isThreadLocked={isThreadLocked}
            hideDownCount={hideDownCount}
          />
        ))}
      </div>
    </div>
  )
}
