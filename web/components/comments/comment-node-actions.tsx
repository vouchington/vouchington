'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'
import { ScoreVote } from '@/components/votes/score-vote'
import { clearPostVote, submitPostVote } from '@/lib/api/client/elections'
import { SaveButton } from '@/components/shared/save-button'
import { DeleteCommentButton } from './delete-comment-button'
import { PostLockButton } from '@/components/posts/post-lock-button'
import type { CommentNodeData } from './comment-tree-utils'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useAuth } from '@/lib/auth/context'

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const AdminModerationButton = dynamic(() => import('@/components/admin/admin-moderation-button'))

export function CommentNodeActions({
  hideDownCount,
  isAdmin,
  node,
  onQuote,
  onToggleReply,
  onStartEdit,
  onDeleted,
  permalink,
  replyToId,
  isThreadLocked,
}: {
  hideDownCount: boolean
  isAdmin: boolean
  node: CommentNodeData
  onQuote: (comment: CommentNodeData['post']) => void
  onToggleReply: (id: string | null) => void
  onStartEdit: () => void
  onDeleted: () => void
  permalink: string
  replyToId: string | null
  isThreadLocked: boolean
}) {
  const t = useTranslations()
  const { currentUser, isAuthenticated } = useAuth()
  const currentUserId = currentUser?.id ?? null
  const { election, electionVote, moderationElections, moderations, post } = node
  const isOwner = !!currentUserId && post.created_by_id === currentUserId
  const isReplyLocked = isThreadLocked || post.locked_at != null
  /* c8 ignore start -- icon aliases are covered by Vitest; selected browser coverage does not visit comment actions */
  const EditIcon = EntityActionIcons.edit
  const QuoteIcon = EntityActionIcons.quote
  const ReplyIcon = EntityActionIcons.reply
  /* c8 ignore stop */
  return (
    <div className='mb-2 flex items-center gap-3'>
      {election && (
        <ScoreVote
          entityType='comment'
          electionId={election.id}
          countUp={election.votes_count_up ?? 0}
          countDown={election.votes_count_down ?? 0}
          existingVoteChoice={
            electionVote?.choice as import('@/lib/api/client/elections').SentimentChoice | undefined
          }
          submitVote={(id, choice) =>
            submitPostVote(id, choice as import('@/lib/api/client/elections').SentimentChoice)
          }
          clearVote={clearPostVote}
          signedOut={!isAuthenticated}
          hideDownCount={hideDownCount}
          data-pw='comment-vote'
        />
      )}
      {!isReplyLocked && (
        <>
          <Button
            type='button'
            variant='ghost'
            onClick={() => onToggleReply(replyToId === post.id ? null : post.id)}
            className='h-auto w-auto p-0 text-xs text-muted-foreground hover:text-foreground'
            data-pw='comment-reply-button'
          >
            <ReplyIcon
              data-icon='inline-start'
              className='!h-3 !w-3'
            />
            {t('extracted.comments.commentNodeActions.reply_c253f451')}
          </Button>
          <Button
            type='button'
            variant='ghost'
            onClick={() => onQuote(post)}
            className='h-auto w-auto p-0 text-xs text-muted-foreground hover:text-foreground'
          >
            <QuoteIcon
              data-icon='inline-start'
              className='!h-3 !w-3'
            />
            {t('extracted.comments.commentNodeActions.quote_eb4cdebd')}
          </Button>
        </>
      )}
      <Link
        prefetch={false}
        href={permalink}
        className='text-xs text-muted-foreground hover:text-foreground'
      >
        {t('extracted.comments.commentNodeActions.permalink_273a12af')}
      </Link>
      {isAuthenticated && (
        <SaveButton
          entityType='post'
          entityId={post.id}
          initialActive={node.bookmarks?.['save'] ?? false}
          data-pw='comment-save-button'
        />
      )}
      {isAuthenticated && (isOwner || isAdmin) && post.can_edit_content && (
        <Button
          type='button'
          variant='ghost'
          onClick={onStartEdit}
          className='h-auto w-auto p-0 text-xs text-muted-foreground hover:text-foreground'
          data-pw='comment-edit-button'
        >
          <EditIcon
            data-icon='inline-start'
            className='!h-3 !w-3'
          />
          {t('extracted.comments.commentNodeActions.edit_464c4ffd')}
        </Button>
      )}
      {isAuthenticated && post.can_delete && (
        <DeleteCommentButton
          commentId={post.id}
          onDeleted={onDeleted}
        />
      )}
      {isAuthenticated && post.can_lock && (
        <PostLockButton
          postIdOrSlug={post.id}
          lockedAt={post.locked_at}
        />
      )}
      {moderations !== undefined && (
        <AdminModerationButton
          moderations={moderations}
          elections={moderationElections}
          electionVotes={node.moderationElectionVotes}
        />
      )}
    </div>
  )
}
