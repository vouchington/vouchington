import Link from 'next/link'
import dynamic from 'next/dynamic'
import { UserOfficialBadge } from '@/components/shared/user-official-badge'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'
import { HideButton } from '@/components/shared/hide-button'
import { SaveButton } from '@/components/shared/save-button'
import { TimeAgo } from '@/components/shared/time-ago'
import { ScoreVote } from '@/components/votes/score-vote'
import { UserLink } from '@/components/users/user-link'
import {
  clearPostVote,
  isRecommendationChoice,
  isSentimentChoice,
  submitPostRecommendationVote,
  submitPostVote,
} from '@/lib/api/client/elections'
import { userTabForPostType } from '@/lib/links/entity-href'
import { useAuth } from '@/lib/auth/context'
import { useTranslations } from '@/lib/i18n/use-translations'
import { ReportMenuKebab } from '@/components/shared/report-menu-item'
import type AdminModerationButtonComponent from '@/components/admin/admin-moderation-button'
import type { AgentModeration, AgentModerationElection } from '@/types/agents'
import type { ElectionVote, Post, PostElection } from '@/types/posts'

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const AdminModerationButton = dynamic<Parameters<typeof AdminModerationButtonComponent>[0]>(
  () => import('@/components/admin/admin-moderation-button'),
)

export function PostCardFooter({
  post,
  routePath,
  election,
  electionVote,
  commentCount,
  hideDownCount,
  moderations,
  moderationElections,
  moderationElectionVotes,
  initialSaved,
  initialHidden,
  onHide,
  hideBookmarkActions,
}: {
  post: Post
  routePath: string
  election?: PostElection
  electionVote?: ElectionVote
  commentCount: number
  hideDownCount: boolean
  moderations?: AgentModeration[]
  moderationElections?: Record<string, AgentModerationElection>
  moderationElectionVotes?: Record<string, ElectionVote>
  initialSaved: boolean
  initialHidden: boolean
  onHide?: (postId: string) => void
  hideBookmarkActions?: boolean
}) {
  const { currentUser, isAuthenticated } = useAuth()
  const currentUserId = currentUser?.id ?? null
  const t = useTranslations()
  const CommentCountIcon = EntityActionIcons.commentCount
  return (
    <div className='relative z-10 flex flex-wrap items-center gap-3 text-xs text-muted-foreground'>
      {election && post.post_type === 'topic_recommendation' ? (
        <ScoreVote
          entityType='post'
          electionId={election.id}
          countUp={election.votes_count_up ?? 0}
          countDown={election.votes_count_down ?? 0}
          existingVoteChoice={
            isRecommendationChoice(electionVote?.choice) ? electionVote.choice : undefined
          }
          policy='recommendation'
          submitVote={submitPostRecommendationVote}
          clearVote={clearPostVote}
          signedOut={!isAuthenticated}
          hideDownCount={hideDownCount}
        />
      ) : election ? (
        <ScoreVote
          entityType='post'
          electionId={election.id}
          countUp={election.votes_count_up ?? 0}
          countDown={election.votes_count_down ?? 0}
          existingVoteChoice={
            isSentimentChoice(electionVote?.choice) ? electionVote.choice : undefined
          }
          submitVote={submitPostVote}
          clearVote={clearPostVote}
          signedOut={!isAuthenticated}
          hideDownCount={hideDownCount}
        />
      ) : null}
      <Link
        prefetch={false}
        href={`/${routePath}/${post.id}`}
        className='flex items-center gap-1 hover:text-foreground'
      >
        <CommentCountIcon className='h-3 w-3' />
        <span>{t('shared.countLabel.format', { count: commentCount, unit: 'comment' })}</span>
      </Link>
      {post.created_by?.username ? (
        <UserLink
          user={post.created_by}
          tab={userTabForPostType(post.post_type)}
          className='hover:text-foreground'
        />
      ) : null}
      <UserOfficialBadge isOfficial={post.created_by?.is_official_account} />
      <TimeAgo date={post.created_at} />
      {isAuthenticated && !hideBookmarkActions ? (
        <SaveButton
          entityType='post'
          entityId={post.id}
          initialActive={initialSaved}
          data-pw='post-card-save-button'
        />
      ) : null}
      {isAuthenticated && !hideBookmarkActions ? (
        <HideButton
          entityType='post'
          entityId={post.id}
          initialActive={initialHidden}
          onHide={onHide}
        />
      ) : null}
      {currentUserId && post.created_by_id != null && currentUserId !== post.created_by_id ? (
        <ReportMenuKebab
          entityType={post.post_type === 'comment' ? 'comment' : 'post'}
          entityId={post.id}
          data-pw='post-card-report-button'
        />
      ) : null}
      {moderations !== undefined ? (
        <AdminModerationButton
          moderations={moderations}
          elections={moderationElections}
          electionVotes={moderationElectionVotes}
        />
      ) : null}
    </div>
  )
}
