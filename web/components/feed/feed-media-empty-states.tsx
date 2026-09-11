/**
 * Empty state helper for media feed pages (news, podcasts, videos).
 * Uses a data table to stay within the 200-line limit.
 */
import type { ReactNode } from 'react'
import Link from 'next/link'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import type {
  NewsFeedRouteConfig,
  PodcastFeedRouteConfig,
  VideoFeedRouteConfig,
} from '@/lib/feed-route-configs'

export type MediaFeedRouteConfig =
  | NewsFeedRouteConfig
  | PodcastFeedRouteConfig
  | VideoFeedRouteConfig

type Category = MediaFeedRouteConfig['category']
type FeedType = MediaFeedRouteConfig['feedType']

interface EmptyStateSpec {
  title: string
  description: string
  actions: { label: string; href: string }[]
}

const EMPTY_STATES: Partial<Record<FeedType, Partial<Record<Category, EmptyStateSpec>>>> & {
  any: Record<Category, EmptyStateSpec>
} = {
  follow_rss_feeds: {
    podcasts: {
      title: 'No podcast episodes yet',
      description: 'Follow podcasts to see episodes here',
      actions: [{ label: 'Browse Podcasts', href: '/podcasts' }],
    },
    videos: {
      title: 'No videos yet',
      description: 'Follow channels to see videos here',
      actions: [{ label: 'Browse Channels', href: '/channels' }],
    },
    news: {
      title: 'No articles yet',
      description: 'Follow news sources to see articles here',
      actions: [{ label: 'Browse Sources', href: '/sources' }],
    },
  },
  follow_users: {
    podcasts: {
      title: 'No shared podcast episodes yet',
      description: 'Follow people to see podcast episodes they share',
      actions: [{ label: 'Find Friends', href: '/my/friend-recommendations' }],
    },
    videos: {
      title: 'No shared videos yet',
      description: 'Follow people to see videos they share',
      actions: [{ label: 'Find Friends', href: '/my/friend-recommendations' }],
    },
    news: {
      title: 'No shared articles yet',
      description: 'Follow people to see articles they share',
      actions: [{ label: 'Find Friends', href: '/my/friend-recommendations' }],
    },
  },
  follow_topics: {
    podcasts: {
      title: 'No podcast episodes yet',
      description: 'Follow some topics to see related podcast episodes here',
      actions: [{ label: 'Browse Topics', href: '/topics' }],
    },
    videos: {
      title: 'No videos yet',
      description: 'Follow some topics to see related videos here',
      actions: [{ label: 'Browse Topics', href: '/topics' }],
    },
    news: {
      title: 'No news yet',
      description: 'Follow some topics to see related news here',
      actions: [{ label: 'Browse Topics', href: '/topics' }],
    },
  },
  any: {
    podcasts: {
      title: 'Your podcast feed is empty',
      description: 'Follow topics and podcasts to see episodes here',
      actions: [
        { label: 'Browse Podcasts', href: '/podcasts' },
        { label: 'Browse Topics', href: '/topics' },
      ],
    },
    videos: {
      title: 'Your video feed is empty',
      description: 'Follow topics and channels to see videos here',
      actions: [
        { label: 'Browse Channels', href: '/channels' },
        { label: 'Browse Topics', href: '/topics' },
      ],
    },
    news: {
      title: 'Your news feed is empty',
      description: 'Follow topics and sources to see articles here',
      actions: [
        { label: 'Browse Sources', href: '/sources' },
        { label: 'Browse Topics', href: '/topics' },
      ],
    },
  },
}

function renderEmptyState({ title, description, actions }: EmptyStateSpec): ReactNode {
  return (
    <EmptyState
      icon='inbox'
      title={title}
      description={description}
    >
      <div className='flex gap-2'>
        {actions.map(({ label, href }) => (
          <Button
            key={href}
            asChild
            variant='outline'
            size='default'
          >
            <Link
              href={href}
              prefetch={false}
            >
              {label}
            </Link>
          </Button>
        ))}
      </div>
    </EmptyState>
  )
}

export function getMediaFeedEmptyState(feedType: FeedType, category: Category): ReactNode {
  const byCategory = EMPTY_STATES[feedType] ?? EMPTY_STATES.any
  const spec = byCategory[category] ?? EMPTY_STATES.any[category]
  return renderEmptyState(spec)
}
