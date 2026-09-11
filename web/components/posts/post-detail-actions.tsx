'use client'

import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ScoreVote } from '@/components/votes/score-vote'
import { HideButton } from '@/components/shared/hide-button'
import { SaveButton } from '@/components/shared/save-button'
import {
  clearPostVote,
  isRecommendationChoice,
  isSentimentChoice,
  submitPostRecommendationVote,
  submitPostVote,
  type ElectionVoteChoice,
} from '@/lib/api/client/elections'
import { useAuth } from '@/lib/auth/context'
import type { PostType } from '@/types/posts'
import { DiscussInCommunityAction } from './discuss-in-community-action'
import { useTranslations } from '@/lib/i18n/use-translations'

interface PostDetailActionsProps {
  election?: { id: string; votesCountUp: number; votesCountDown: number }
  existingVoteChoice?: ElectionVoteChoice
  hideDownCount: boolean
  post: {
    id: string
    postType: PostType
    canDiscussInCommunity: boolean
    discussionSource?: { title?: string | null; canonicalPath: string }
  }
  initialSaved?: boolean
  initialHidden?: boolean
}

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const EntityBookmarkButton = dynamic(() =>
  import('@/components/shared/entity-bookmark-button').then(mod => mod.EntityBookmarkButton),
)

export function PostDetailActions(props: PostDetailActionsProps) {
  const t = useTranslations()
  const { push } = useRouter()
  const { isAuthenticated } = useAuth()
  const initialSaved = props.initialSaved ?? false
  const initialHidden = props.initialHidden ?? false
  const canDiscussInCommunity = isAuthenticated && props.post.canDiscussInCommunity
  return (
    <div className='flex flex-wrap items-center gap-3 border-t pt-3'>
      {props.election && props.post.postType === 'topic_recommendation' ? (
        <ScoreVote
          entityType='post'
          electionId={props.election.id}
          countUp={props.election.votesCountUp}
          countDown={props.election.votesCountDown}
          existingVoteChoice={
            isRecommendationChoice(props.existingVoteChoice) ? props.existingVoteChoice : undefined
          }
          policy='recommendation'
          submitVote={submitPostRecommendationVote}
          clearVote={clearPostVote}
          signedOut={!isAuthenticated}
          hideDownCount={props.hideDownCount}
        />
      ) : props.election ? (
        <ScoreVote
          entityType='post'
          electionId={props.election.id}
          countUp={props.election.votesCountUp}
          countDown={props.election.votesCountDown}
          existingVoteChoice={
            isSentimentChoice(props.existingVoteChoice) ? props.existingVoteChoice : undefined
          }
          submitVote={submitPostVote}
          clearVote={clearPostVote}
          signedOut={!isAuthenticated}
          hideDownCount={props.hideDownCount}
        />
      ) : null}
      {isAuthenticated && (
        <EntityBookmarkButton
          entityType='post'
          entityId={props.post.id}
          preset='subscribe'
          inactiveLabel={
            props.post.postType === 'comment'
              ? t('extracted.posts.postDetailActions.subscribeToReplies_85cbc50a')
              : t('extracted.posts.postDetailActions.subscribe_cc0e38da')
          }
          activeLabel={
            props.post.postType === 'comment'
              ? t('extracted.posts.postDetailActions.subscribedToReplies_045c0ccc')
              : t('extracted.posts.postDetailActions.subscribed_25c4797c')
          }
          tooltip={t('extracted.posts.postDetailActions.getNotifiedOfNewReplies_f13ebca2')}
        />
      )}
      {isAuthenticated && (
        <SaveButton
          entityType='post'
          entityId={props.post.id}
          initialActive={initialSaved}
          data-pw='post-save-button'
        />
      )}
      {isAuthenticated && (
        <HideButton
          entityType='post'
          entityId={props.post.id}
          initialActive={initialHidden}
          onHide={() => push('/')}
        />
      )}
      {canDiscussInCommunity && props.post.discussionSource && (
        <DiscussInCommunityAction
          postId={props.post.id}
          source={props.post.discussionSource}
        />
      )}
    </div>
  )
}
