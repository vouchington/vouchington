'use client'

import Link from 'next/link'
import { Link2, Lock, UserCheck, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { TopicLabel } from '@/components/topics/topic-label'
import { communityHref, reviewHref, topicTabForPostType } from '@/lib/links/entity-href'
import { humanizePostType } from '@ts-shared/utils/format'
import type { Post, PostCommunity } from '@/types/posts'
import { useTranslations } from '@/lib/i18n/use-translations'

export function PostCardBadges({
  post,
  filterReviewTopicIds,
  community,
}: {
  post: Post
  filterReviewTopicIds?: string[]
  community?: PostCommunity | null
}) {
  const t = useTranslations()
  const ratings = post.review_topic_ratings ?? []
  const filterIds = filterReviewTopicIds ?? []
  const sortedRatings =
    filterIds.length > 0
      ? [
          ...ratings.filter(rating => filterIds.includes(rating.topic_id)),
          ...ratings.filter(rating => !filterIds.includes(rating.topic_id)),
        ]
      : ratings
  const reviewTopicIds = new Set(ratings.map(rating => rating.topic_id))
  const categoryTopics = (post.post_related_topics ?? [])
    .filter(topic => !reviewTopicIds.has(topic.id))
    .slice(0, 5)
  const hasReferralProgram = sortedRatings.some(
    rating => rating.topic?.referral_program_id || rating.topic?.topic_type === 'referral_program',
  )
  return (
    <div className='scrollbar-hide relative z-10 flex items-center gap-1.5 overflow-x-auto'>
      <Badge
        variant={post.post_type}
        className='text-xs'
        // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
        data-pw={`post-card-type-badge-${post.post_type}`}
      >
        {humanizePostType(post.post_type)}
      </Badge>
      <BroadcastBadge post={post} />
      {community ? (
        <Link
          href={communityHref(community)}
          prefetch={false}
          className='flex-shrink-0'
          data-pw='post-card-community-label'
        >
          <Badge
            variant='outline'
            className='whitespace-nowrap text-xs'
          >
            <Users className='mr-1 h-3 w-3' />
            {community.name}
          </Badge>
        </Link>
      ) : null}
      {post.privacy === 'private' ? (
        <Badge
          variant='outline'
          className='text-xs'
        >
          <Lock className='mr-1 h-3 w-3' />
          {t('extracted.postCard.postCardBadges.private_c63eb672')}
        </Badge>
      ) : null}
      {post.post_type === 'review' &&
        sortedRatings.map(rating =>
          rating.topic ? (
            <TopicLabel
              key={rating.topic_id}
              topic={rating.topic}
              tab={topicTabForPostType(post.post_type)}
              className='flex-shrink-0 whitespace-nowrap text-xs'
              ariaLabel={t('extracted.postCard.postCardBadges.nameRatingOutOf5Stars_0af58dda', {
                name: rating.topic.name,
                rating: rating.rating,
              })}
            >
              <span aria-hidden='true'>
                {rating.topic.name} {'★'.repeat(rating.rating)}
                {'☆'.repeat(5 - rating.rating)}
              </span>
            </TopicLabel>
          ) : null,
        )}
      {categoryTopics.map(topic => (
        <TopicLabel
          key={topic.id}
          topic={topic}
          tab={topicTabForPostType(post.post_type)}
          variant='outline'
          className='flex-shrink-0 whitespace-nowrap text-xs'
        />
      ))}
      {post.post_type === 'review' && hasReferralProgram ? (
        <Link
          href={reviewHref(post)}
          prefetch={false}
          className='flex-shrink-0'
        >
          <Badge
            variant='outline'
            className='whitespace-nowrap text-xs'
          >
            <Link2 className='mr-1 h-3 w-3' />
            {t('extracted.postCard.postCardBadges.referral_aeb7b004')}
          </Badge>
        </Link>
      ) : null}
    </div>
  )
}

function BroadcastBadge({ post }: { post: Post }) {
  const t = useTranslations()
  if (post.broadcast === 'followers') {
    return (
      <Badge
        variant='outline'
        className='text-xs'
      >
        <Users className='mr-1 h-3 w-3' />
        {t('extracted.postCard.postCardBadges.followers_a145ab34')}
      </Badge>
    )
  }
  if (post.broadcast === 'users') {
    return (
      <Badge
        variant='outline'
        className='text-xs'
      >
        <Users className='mr-1 h-3 w-3' />
        {t('extracted.postCard.postCardBadges.signedIn_f44ee573')}
      </Badge>
    )
  }
  if (post.broadcast === 'mutual_followers') {
    return (
      <Badge
        variant='outline'
        className='text-xs'
      >
        <UserCheck className='mr-1 h-3 w-3' />
        {t('extracted.postCard.postCardBadges.mutual_1f363d20')}
      </Badge>
    )
  }
  return null
}
