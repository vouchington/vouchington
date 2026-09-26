import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { RssFeedActionSlot } from '@/components/sources/rss-feed-action-slot'
import { USER_RELATION_ACTIONS } from '@/components/users/user-relation-actions'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'
import type { ViewRssFeed } from '@/types/rss-feeds'

const feedTopic = topics.find(topic => topic.topic_type === 'rss_feed')!

const feed = {
  __entity_type: 'rss_feed',
  id: 'rss-feed-fintech-daily',
  title: 'Fintech Daily',
  is_enabled: true,
  is_discoverable: true,
  etag: 'W/"fintech-daily"',
  last_modified_at: '2026-05-10T12:00:00.000Z',
  last_fetched_at: '2026-05-10T12:00:00.000Z',
  feed_type: 'article',
  rss_feed_url: { id: 'url-fintech-feed', url: 'https://fintech.example/feed/rss' },
  home_page_url: { url: 'https://fintech.example/' },
  hostname: {
    __entity_type: 'hostname',
    id: 'hostname-fintech-example',
    hostname: 'fintech.example',
    topic_id: feedTopic.id,
  },
  topic: {
    id: feedTopic.id,
    name: 'Fintech Daily',
    slug: feedTopic.slug,
    topic_type: feedTopic.topic_type,
  },
} satisfies ViewRssFeed

const meta = {
  title: 'Sources/RSS Feed Action Slot',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Follow: Story = {
  render: () => (
    <StoryFrame>
      <div className='flex flex-wrap gap-2'>
        <RssFeedActionSlot
          feed={feed}
          action={{ kind: 'follow' }}
          isFollowing={false}
          isFollowingTopic
        />
      </div>
    </StoryFrame>
  ),
}

export const MutedRelation: Story = {
  render: () => (
    <StoryFrame>
      <RssFeedActionSlot
        feed={feed}
        action={{ kind: 'relation', config: USER_RELATION_ACTIONS.rssFeed.muted }}
        isFollowing={false}
        isFollowingTopic={false}
      />
    </StoryFrame>
  ),
}
