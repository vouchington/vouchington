// oxlint-disable react-doctor/no-derived-useState -- initial state from props is intentional
'use client'

import { useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'
import { CommentNodeHeader } from './comment-node-header'
import { CommentNodeContent } from './comment-node-content'
import { CommentNodeActions } from './comment-node-actions'
import { CommentNodeReplyForm } from './comment-node-reply'
import { CommentNodeEditForm } from './comment-node-edit-form'
import type { CommentNodeProps } from './comment-node-types'
import type { Post } from '@/types/posts'
import { previewMarkdown } from '@/lib/api/client/markdown'
import { useAuth } from '@/lib/auth/context'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

const MAX_DEPTH = 5

export function CommentNode({
  node,
  depth,
  rootPostId,
  rootPostType,
  collapsedIds,
  replyToId,
  quoteMarkdown,
  onToggleCollapse,
  onToggleReply,
  onCommentAdded,
  onQuote,
  isAdmin,
  isThreadLocked,
  hideDownCount = false,
  moreRepliesIds,
  onLoadMoreReplies,
}: CommentNodeProps) {
  const t = useTranslations()
  const { currentUser, isAuthenticated } = useAuth()
  const currentUserId = currentUser?.id ?? null
  const [localPost, setLocalPost] = useState<Post>(node.post)
  const [localHtml, setLocalHtml] = useState<string | null>(node.html)
  const [isEditing, setIsEditing] = useState(false)

  const { children } = node
  const isCollapsed = collapsedIds.has(localPost.id)
  const isDeleted = !!localPost.deleted_at || localPost.placeholder_state === 'deleted'
  const isUnmoderated = localPost.placeholder_state === 'unmoderated'
  const isPlaceholder = isDeleted || isUnmoderated
  const isReplyLocked = isThreadLocked || localPost.locked_at != null
  const permalink = `/${rootPostType}/${rootPostId}/comment/${localPost.id}`
  const reportEntityId =
    isAuthenticated &&
    !isPlaceholder &&
    currentUserId &&
    localPost.created_by &&
    currentUserId !== localPost.created_by.id
      ? localPost.id
      : undefined

  const username =
    localPost.created_by?.username ?? (localPost.is_anonymous ? 'Anonymous' : 'deleted')
  const isAnonymous = localPost.is_anonymous && !localPost.created_by

  function handleEditSave(updatedPost: Post) {
    setLocalPost(updatedPost)
    setIsEditing(false)
    setLocalHtml(null)
    previewMarkdown(updatedPost.markdown ?? '')
      .then(r => setLocalHtml(r.html))
      .catch(Sentry.captureException)
  }

  function handleDeleted() {
    setLocalPost(p => ({ ...p, deleted_at: new Date().toISOString(), created_by: null }))
  }

  return (
    <div
      className={depth > 0 ? 'border-l border-border pl-4' : ''}
      data-pw='comment-node'
    >
      <div className='py-1'>
        <CommentNodeHeader
          childrenCount={node.childrenCount ?? children.length}
          hideDownCount={hideDownCount}
          isAnonymous={isAnonymous}
          isCollapsed={isCollapsed}
          isDeleted={isDeleted}
          isUnmoderated={isUnmoderated}
          node={{ ...node, post: localPost }}
          onToggleCollapse={onToggleCollapse}
          permalink={permalink}
          reportEntityId={reportEntityId}
          username={username}
        />

        {!isCollapsed && (
          <>
            {isEditing ? (
              <CommentNodeEditForm
                post={localPost}
                onSave={handleEditSave}
                onCancel={() => setIsEditing(false)}
              />
            ) : (
              <CommentNodeContent
                html={localHtml}
                isDeleted={isDeleted}
                isUnmoderated={isUnmoderated}
                post={localPost}
              />
            )}

            {!isPlaceholder && !isEditing && (
              <CommentNodeActions
                hideDownCount={hideDownCount}
                isAdmin={isAdmin}
                node={{ ...node, post: localPost }}
                onQuote={onQuote}
                onToggleReply={onToggleReply}
                onStartEdit={() => setIsEditing(true)}
                onDeleted={handleDeleted}
                permalink={permalink}
                replyToId={replyToId}
                isThreadLocked={isThreadLocked}
              />
            )}

            {!isReplyLocked && replyToId === localPost.id && (
              <CommentNodeReplyForm
                onCommentAdded={onCommentAdded}
                onToggleReply={onToggleReply}
                postId={localPost.id}
                quoteMarkdown={quoteMarkdown}
                rootPostId={rootPostId}
              />
            )}

            {children.length > 0 && (
              <div className='space-y-0'>
                {depth >= MAX_DEPTH ? (
                  <Link
                    prefetch={false}
                    href={permalink}
                    className='text-xs text-blue-600 hover:underline dark:text-blue-400'
                  >
                    See {children.length} more {children.length === 1 ? 'reply' : 'replies'}
                  </Link>
                ) : (
                  children.map(child => (
                    <CommentNode
                      key={`${child.post.id}:${child.post.locked_at ?? ''}:${child.post.locked_by_id ?? ''}`}
                      node={child}
                      depth={depth + 1}
                      rootPostId={rootPostId}
                      rootPostType={rootPostType}
                      collapsedIds={collapsedIds}
                      replyToId={replyToId}
                      quoteMarkdown={quoteMarkdown}
                      onToggleCollapse={onToggleCollapse}
                      onToggleReply={onToggleReply}
                      onCommentAdded={onCommentAdded}
                      onQuote={onQuote}
                      isAdmin={isAdmin}
                      isThreadLocked={isThreadLocked}
                      hideDownCount={hideDownCount}
                      moreRepliesIds={moreRepliesIds}
                      onLoadMoreReplies={onLoadMoreReplies}
                    />
                  ))
                )}
              </div>
            )}

            {moreRepliesIds?.has(localPost.id) && (
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={() => onLoadMoreReplies?.(localPost.id)}
              >
                {t('extracted.comments.commentNode.loadMore_ac8991ef')}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
