'use client'

import { CommentReplyForm } from './comment-reply-form'
import type { CommentNodeProps } from './comment-node-types'
import { useTranslations } from '@/lib/i18n/use-translations'

export function CommentNodeReplyForm({
  onCommentAdded,
  onToggleReply,
  postId,
  quoteMarkdown,
  rootPostId,
}: Pick<CommentNodeProps, 'onCommentAdded' | 'onToggleReply' | 'quoteMarkdown' | 'rootPostId'> & {
  postId: string
}) {
  const t = useTranslations()
  return (
    <div className='mb-3'>
      <CommentReplyForm
        key={quoteMarkdown}
        parentId={postId}
        rootId={rootPostId}
        onSuccess={(newComment, html) => {
          onCommentAdded(postId, newComment, html)
          onToggleReply(null)
        }}
        onCancel={() => onToggleReply(null)}
        showCancel
        placeholder={t('extracted.comments.commentNodeReply.writeAReply_de9ef972')}
        initialMarkdown={quoteMarkdown}
      />
    </div>
  )
}
