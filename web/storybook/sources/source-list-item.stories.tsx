import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SourceListItem } from '@/components/sources/source-list-item'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'
import type { ViewRssFeed } from '@/types/rss-feeds'

const feedTopic = topics.find(topic => topic.topic_type === 'rss_feed')!
const newsroom = topics[0]!

const feed = {
  __entity_type: 'rss_feed',
  id: 'rss-feed-fintech-daily',
  title: 'Fintech Daily',
  is_enabled: true,
  is_discoverable: true,
  etag: null,
  last_modified_at: null,
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
  publisher_type: {
    id: newsroom.id,
    slug: newsroom.slug,
    topic_type: newsroom.topic_type,
    name: 'Newsroom',
  },
} satisfies ViewRssFeed

const meta = {
  title: 'Sources/Source List Item',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const FollowingSource: Story = {
  render: () => (
    <StoryFrame>
      <SourceListItem
        feed={feed}
        action={{ kind: 'follow' }}
        isFollowing
        isFollowingTopic
        hostnameElection={{
          __entity_type: 'hostname_election',
          id: 'hostname-election-fintech',
          votes_score_net: 18,
          votes_count_up: 22,
          votes_count_down: 4,
        }}
        topicElection={{
          id: 'topic-election-fintech-daily',
          votes_score_net: 11,
          votes_count_up: 14,
          votes_count_down: 3,
        }}
      />
    </StoryFrame>
  ),
}

export const NotFollowing: Story = {
  render: () => (
    <StoryFrame>
      <SourceListItem
        feed={feed}
        action={{ kind: 'follow' }}
        isFollowing={false}
        isFollowingTopic={false}
      />
    </StoryFrame>
  ),
}
