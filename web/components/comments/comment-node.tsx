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
}: CommentNodeProps) {
  const { currentUser, isAuthenticated } = useAuth()
  const currentUserId = currentUser?.id ?? null
  const [localPost, setLocalPost] = useState<Post>(node.post)
  const [localHtml, setLocalHtml] = useState<string | null>(node.html)
  const [isEditing, setIsEditing] = useState(false)

  const post = localPost
  const html = localHtml
  const { children } = node
  const isCollapsed = collapsedIds.has(post.id)
  const isDeleted = !!post.deleted_at
  const isReplyLocked = isThreadLocked || post.locked_at != null
  const permalink = `/${rootPostType}/${rootPostId}/comment/${post.id}`
  const reportEntityId =
    isAuthenticated &&
    !isDeleted &&
    currentUserId &&
    post.created_by &&
    currentUserId !== post.created_by.id
      ? post.id
      : undefined

  const username = post.created_by?.username ?? (post.is_anonymous ? 'Anonymous' : 'deleted')
  const isAnonymous = post.is_anonymous && !post.created_by

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
          childrenCount={children.length}
          hideDownCount={hideDownCount}
          isAnonymous={isAnonymous}
          isCollapsed={isCollapsed}
          isDeleted={isDeleted}
          node={{ ...node, post }}
          onToggleCollapse={onToggleCollapse}
          permalink={permalink}
          reportEntityId={reportEntityId}
          username={username}
        />

        {!isCollapsed && (
          <>
            {isEditing ? (
              <CommentNodeEditForm
                post={post}
                onSave={handleEditSave}
                onCancel={() => setIsEditing(false)}
              />
            ) : (
              <CommentNodeContent
                html={html}
                isDeleted={isDeleted}
                post={post}
              />
            )}

            {!isDeleted && !isEditing && (
              <CommentNodeActions
                hideDownCount={hideDownCount}
                isAdmin={isAdmin}
                node={{ ...node, post }}
                onQuote={onQuote}
                onToggleReply={onToggleReply}
                onStartEdit={() => setIsEditing(true)}
                onDeleted={handleDeleted}
                permalink={permalink}
                replyToId={replyToId}
                isThreadLocked={isThreadLocked}
              />
            )}

            {!isReplyLocked && replyToId === post.id && (
              <CommentNodeReplyForm
                onCommentAdded={onCommentAdded}
                onToggleReply={onToggleReply}
                postId={post.id}
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
                    className='text-xs text-blue-600 hover:underline'
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
                    />
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
