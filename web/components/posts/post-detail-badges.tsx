import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { TopicLabel } from '@/components/topics/topic-label'
import { communityHref, topicTabForPostType } from '@/lib/links/entity-href'
import { humanizePostType } from '@ts-shared/utils/format'
import { Lock, UserCheck, Users } from 'lucide-react'
import type { Post, PostCommunity, PostType } from '@/types/posts'

export interface PostDetailBadgeLabels {
  private: string
  locked: string
  followers: string
  signedIn: string
  mutual: string
}

interface ReviewRatingViewModel {
  topicId: string
  topic: NonNullable<NonNullable<Post['review_topic_ratings']>[number]['topic']>
  rating: number
  ariaLabel: string
}

interface PostDetailBadgesProps {
  categoryTopics: NonNullable<Post['post_related_topics']>
  postType: PostType
  broadcast: Post['broadcast']
  privacy: Post['privacy']
  locked: boolean
  reviewRatings: ReviewRatingViewModel[]
  community?: PostCommunity | null
  labels: PostDetailBadgeLabels
}

export function PostDetailBadges({
  categoryTopics,
  postType,
  broadcast,
  privacy,
  locked,
  reviewRatings,
  community,
  labels,
}: PostDetailBadgesProps) {
  return (
    <div className='scrollbar-hide flex items-center gap-1.5 overflow-x-auto'>
      <Badge
        variant={postType}
        // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
        data-pw={`post-detail-type-badge-${postType}`}
      >
        {humanizePostType(postType)}
      </Badge>
      <BroadcastBadge
        broadcast={broadcast}
        labels={labels}
      />
      {community ? (
        <Link
          href={communityHref(community)}
          prefetch={false}
          className='flex-shrink-0'
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
      {privacy === 'private' && (
        <Badge
          variant='outline'
          className='text-xs'
          data-pw='post-detail-badge-private'
        >
          <Lock className='mr-1 h-3 w-3' />
          {labels.private}
        </Badge>
      )}
      {locked && (
        <Badge
          variant='outline'
          className='text-xs'
          data-pw='post-detail-badge-locked'
        >
          <Lock
            className='mr-1 h-3 w-3'
            aria-hidden='true'
          />
          {labels.locked}
        </Badge>
      )}
      {postType === 'review' &&
        reviewRatings.map(r =>
          r.topic ? (
            <TopicLabel
              key={r.topicId}
              topic={r.topic}
              tab={topicTabForPostType(postType)}
              className='flex-shrink-0 whitespace-nowrap text-xs'
              ariaLabel={r.ariaLabel}
            >
              <span aria-hidden='true'>
                {r.topic.name} {'★'.repeat(r.rating)}
                {'☆'.repeat(5 - r.rating)}
              </span>
            </TopicLabel>
          ) : null,
        )}
      {categoryTopics.map(t => (
        <TopicLabel
          key={t.id}
          topic={t}
          tab={topicTabForPostType(postType)}
          variant='outline'
          className='flex-shrink-0 whitespace-nowrap text-xs'
        />
      ))}
    </div>
  )
}

function BroadcastBadge({
  broadcast,
  labels,
}: {
  broadcast: Post['broadcast']
  labels: PostDetailBadgeLabels
}) {
  if (broadcast === 'followers')
    return (
      <IconBadge
        icon='users'
        label={labels.followers}
      />
    )
  if (broadcast === 'users')
    return (
      <IconBadge
        icon='users'
        label={labels.signedIn}
      />
    )
  if (broadcast === 'mutual_followers') {
    return (
      <IconBadge
        icon='user-check'
        label={labels.mutual}
      />
    )
  }
  return null
}

function IconBadge({ icon, label }: { icon: 'user-check' | 'users'; label: string }) {
  const Icon = icon === 'users' ? Users : UserCheck
  return (
    <Badge
      variant='outline'
      className='text-xs'
      data-pw='post-detail-broadcast-badge'
    >
      <Icon className='mr-1 h-3 w-3' />
      {label}
    </Badge>
  )
}
