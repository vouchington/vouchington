'use client'

import dynamic from 'next/dynamic'
import { HoverableCard } from '@/components/shared/hoverable-card'
import { SharedByline } from '@/components/shared/shared-byline'
import { getEffectiveContentLanguage } from '@ts-shared/languages/content-languages'
import { postRouteConfigs } from '@/lib/route-configs'
import { useAuth } from '@/lib/auth/context'
import { isModerationStaff } from '@/lib/auth/official-account'
import type { AgentModeration, AgentModerationElection } from '@/types/agents'
import type { PublicUser } from '@/types/user'
import type { ElectionVote, Post, PostCommunity, PostElection, PostMetrics } from '@/types/posts'
import type { UrlEmbed } from '@/types/api-responses'
import { LinkPostMedia } from './link-post-media'
import type { DataPointVertical } from '@voucha/types/entities/data-point'
import { DataPointDetail } from './data-point-detail'
import { canSharePost } from './shareability'
import { PostCardBadges } from './post-card/post-card-badges'
import { PostCardContent } from './post-card/post-card-content'
import { PostCardImages } from './post-card/post-card-images'
import { PostCardFooter } from './post-card/post-card-footer'
import { PostCardTitle } from './post-card/post-card-title'
import { useTranslations } from '@/lib/i18n/use-translations'

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const FollowerShareActions = dynamic(() =>
  import('@/components/shared/follower-share-actions').then(mod => mod.FollowerShareActions),
)

interface PostCardProps {
  post: Post
  metrics?: PostMetrics
  election?: PostElection
  html?: string
  moderations?: AgentModeration[]
  moderationElections?: Record<string, AgentModerationElection>
  moderationElectionVotes?: Record<string, ElectionVote>
  electionVote?: ElectionVote
  view?: 'card' | 'compact'
  filterReviewTopicIds?: string[]
  sharedByUser?: PublicUser
  sharedAt?: string
  priority?: boolean
  hideDownCount?: boolean
  initialSaved?: boolean
  initialHidden?: boolean
  onHide?: (postId: string) => void
  community?: PostCommunity | null
  hideBookmarkActions?: boolean
  linkEmbed?: UrlEmbed
}

export function PostCard({
  post,
  metrics,
  election,
  html,
  moderations,
  moderationElections,
  moderationElectionVotes,
  electionVote,
  view = 'card',
  filterReviewTopicIds,
  sharedByUser,
  sharedAt,
  priority,
  hideDownCount = false,
  initialSaved = false,
  initialHidden = false,
  onHide,
  community,
  hideBookmarkActions,
  linkEmbed,
}: PostCardProps) {
  const t = useTranslations()
  const { currentUser } = useAuth()
  const currentUserId = currentUser?.id ?? null
  const isStaff = isModerationStaff(currentUser)
  const config = Object.values(postRouteConfigs).find(c => c.postTypes?.includes(post.post_type))
  const routePath = config?.singularPath || 'post'
  const shareable =
    canSharePost(post) && currentUserId != null && currentUserId !== post.created_by_id
  const shareActions =
    !hideBookmarkActions && shareable ? (
      <FollowerShareActions
        entityType='post'
        entityId={post.slug ?? post.id}
        ownerUserId={post.created_by_id}
        compact
      />
    ) : null
  const contentLanguage = getEffectiveContentLanguage({
    declaredLanguage: post.declared_language,
    detectedLanguage: post.lingua_rs_detected_language,
  })
  const isRejected = post.clearance_status === 'rejected'
  const showLinkMedia = post.post_type === 'link' && linkEmbed && (!isRejected || isStaff)
  const isLinkArticle = showLinkMedia && linkEmbed.media_type === 'article'
  return (
    <HoverableCard
      className='relative overflow-hidden p-0'
      data-pw='post-card-root'
      data-post-slug={post.slug ?? undefined}
    >
      {view === 'card' && shareActions ? (
        <div className='absolute right-2 top-2 z-20'>{shareActions}</div>
      ) : null}
      <div className='flex gap-4 p-4'>
        <div className='min-w-0 flex-1 space-y-3'>
          {sharedByUser ? (
            <SharedByline
              sharedByUser={sharedByUser}
              sharedAt={sharedAt}
              className={view === 'card' && shareable ? 'pr-14' : undefined}
            />
          ) : null}
          <PostCardTitle
            ownerUserId={post.created_by_id}
            post={post}
            routePath={routePath}
            view={view}
            shareable={shareable}
            hideBookmarkActions={hideBookmarkActions}
          />
          <PostCardBadges
            post={post}
            filterReviewTopicIds={filterReviewTopicIds}
            community={community ?? post.community}
          />
          <PostCardContent
            post={post}
            html={html}
            contentLanguage={contentLanguage}
            currentUserId={currentUserId}
            isStaff={isStaff}
          />
          {post.post_type === 'data_point' &&
          post.data_point_vertical &&
          (!isRejected || isStaff) ? (
            <DataPointDetail
              vertical={post.data_point_vertical as DataPointVertical}
              structuredData={post.structured_data}
              labels={{
                creditCard: t('extracted.posts.dataPointDetail.creditCardDataPoint_7ab2e7d7'),
                bankAccount: t('extracted.posts.dataPointDetail.bankAccountDataPoint_06847f5e'),
              }}
            />
          ) : null}
          {view === 'card' && (!isRejected || isStaff) ? (
            <PostCardImages
              post={post}
              routePath={routePath}
              view='card'
              priority={priority}
            />
          ) : null}
          {showLinkMedia && !isLinkArticle ? (
            <LinkPostMedia
              embed={linkEmbed}
              view='card'
            />
          ) : null}
          <PostCardFooter
            post={post}
            routePath={routePath}
            election={election}
            electionVote={electionVote}
            commentCount={metrics?.count.descendants || 0}
            hideDownCount={hideDownCount}
            moderations={moderations}
            moderationElections={moderationElections}
            moderationElectionVotes={moderationElectionVotes}
            initialSaved={initialSaved}
            initialHidden={initialHidden}
            onHide={onHide}
            hideBookmarkActions={hideBookmarkActions}
          />
        </div>
        {view === 'compact' && (!isRejected || isStaff) ? (
          <PostCardImages
            post={post}
            routePath={routePath}
            view='compact'
            priority={priority}
          />
        ) : null}
        {isLinkArticle && view !== 'compact' ? (
          <LinkPostMedia
            embed={linkEmbed}
            view='card'
          />
        ) : null}
      </div>
    </HoverableCard>
  )
}
