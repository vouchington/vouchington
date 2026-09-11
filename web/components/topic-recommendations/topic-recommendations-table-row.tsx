'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import onError from '@/lib/on-error'
import { Badge } from '@/components/ui/badge'
import { TableCell, TableRow } from '@/components/ui/table'
import { ScoreVote } from '@/components/votes/score-vote'
import { clearPostVote, submitPostRecommendationVote } from '@/lib/api/client/elections'
import { useAuth } from '@/lib/auth/context'
import { createUserPathname } from '@/lib/links/entity-href'
import { TopicRecommendationRowActions } from './topic-recommendation-row-actions'
import type { TopicRecommendationTablePost } from './topic-recommendations-table'
import type { PostsResponseBody } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'
import { PostContentText } from '@/components/posts/post-content-text'

interface TopicRecommendationsTableRowProps {
  election?: NonNullable<PostsResponseBody['post_elections']>[string]
  existingVote?: NonNullable<PostsResponseBody['election_votes']>[string]
  hideDownCount: boolean
  isAdmin: boolean
  post: TopicRecommendationTablePost
  onOpen: (post: TopicRecommendationTablePost) => void
  onWithdraw: (post: TopicRecommendationTablePost) => void
  onQuickApprove: (post: TopicRecommendationTablePost) => void
  onQuickReject: (post: TopicRecommendationTablePost) => void
}

export function TopicRecommendationsTableRow({
  election,
  existingVote,
  hideDownCount,
  isAdmin,
  post,
  onOpen,
  onWithdraw,
  onQuickApprove,
  onQuickReject,
}: TopicRecommendationsTableRowProps) {
  const t = useTranslations()
  const { currentUser } = useAuth()
  const recommendation = post.topic_recommendation!
  const isOwner = post.created_by_id === currentUser?.id
  const isPending = recommendation.status === 'pending'
  const submitterUsername = post.created_by?.username
  const voteOpts = {
    fallback: t(
      'extracted.topicRecommendations.topicRecommendationsTableRow.failedToSubmitVote_849db9a5',
    ),
    skipSentry: true,
  }

  return (
    <TableRow // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
      data-pw={`topic-recommendation-row-${recommendation.topic_slug}`}
    >
      <TableCell>
        <div className='space-y-1'>
          <Button
            type='button'
            variant='link'
            size='sm'
            className='h-auto min-h-6 p-0 font-medium text-foreground hover:text-foreground'
            onClick={() => onOpen(post)}
            data-pw='topic-recommendation-row-title'
          >
            <PostContentText
              as='span'
              content={{
                text: recommendation.topic_title,
                declared_language: post.declared_language,
                lingua_rs_detected_language: post.lingua_rs_detected_language,
              }}
            />
          </Button>
          <Button
            type='button'
            variant='link'
            size='sm'
            className='h-auto min-h-6 p-0 font-mono text-xs text-muted-foreground'
            onClick={() => onOpen(post)}
          >
            {recommendation.topic_slug}
          </Button>
          <div className='flex items-center gap-1 text-xs text-muted-foreground'>
            {submitterUsername ? (
              <Link
                href={createUserPathname(submitterUsername)}
                className='inline-flex min-h-6 items-center hover:underline'
                data-pw='topic-recommendation-row-submitter'
              >
                @{submitterUsername}
              </Link>
            ) : (
              <span>
                {t('extracted.topicRecommendations.topicRecommendationsTableRow.unknown_b764cdc0')}
              </span>
            )}
            <span aria-hidden='true'>
              {t('extracted.topicRecommendations.topicRecommendationsTableRow.text_a137f17a')}
            </span>
            <Button
              type='button'
              variant='link'
              size='sm'
              className='h-auto min-h-6 p-0 text-xs text-muted-foreground'
              onClick={() => onOpen(post)}
            >
              {new Date(post.created_at).toLocaleDateString()}
            </Button>
          </div>
        </div>
      </TableCell>
      <TableCell>
        {election ? (
          <ScoreVote
            electionId={election.id}
            countUp={election.votes_count_up ?? 0}
            countDown={election.votes_count_down ?? 0}
            existingVoteChoice={
              existingVote?.choice as
                | import('@/lib/api/client/elections').RecommendationChoice
                | undefined
            }
            policy='recommendation'
            submitVote={(id, choice) =>
              submitPostRecommendationVote(
                id,
                choice as import('@/lib/api/client/elections').RecommendationChoice,
              )
            }
            clearVote={clearPostVote}
            disabled={recommendation.status !== 'pending'}
            hideDownCount={hideDownCount}
            onError={() => onError(new Error('Failed to submit vote'), voteOpts)}
          />
        ) : (
          <span className='text-sm text-muted-foreground'>
            {t('extracted.topicRecommendations.topicRecommendationsTableRow.text_bda05058')}
          </span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant='outline'>{recommendation.status}</Badge>
      </TableCell>
      <TableCell className='text-right'>
        <TopicRecommendationRowActions
          isAdmin={isAdmin}
          isOwner={isOwner}
          isPending={isPending}
          post={post}
          onQuickApprove={onQuickApprove}
          onQuickReject={onQuickReject}
          onWithdraw={onWithdraw}
        />
      </TableCell>
    </TableRow>
  )
}
