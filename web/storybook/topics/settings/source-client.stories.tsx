import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SourceClient } from '@/components/topics/settings/source-client'
import { StoryFrame } from '@/storybook/story-frame'
import { now } from '@/storybook/entities/fixtures/shared'
import { topics } from '@/storybook/entities/fixtures/topics'

const feed = topics.find(topic => topic.topic_type === 'rss_feed')!

const meta = {
  title: 'Topics/Source',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const FintechDaily: Story = {
  render: () => (
    <StoryFrame>
      <SourceClient
        id={feed.id}
        initialData={{
          loading: false,
          loadError: null,
          rssFeed: {
            id: 'rss-feed-fintech-daily',
            title: 'Fintech Daily',
            rss_feed_url: { url: 'https://fintech.example/feed/rss' },
            home_page_url: { url: 'https://fintech.example/' },
            is_enabled: true,
            is_discoverable: true,
            last_fetched_at: now,
            etag: 'W/"fintech-daily"',
            last_modified_at: now,
          },
          crawls: [{ id: 'crawl-fintech-daily', response_code: 200, created_at: now }],
          confirmDelete: false,
        }}
      />
    </StoryFrame>
  ),
}

export const MissingFeed: Story = {
  render: () => (
    <StoryFrame>
      <SourceClient
        id={feed.id}
        initialData={{ loading: false, loadError: null, rssFeed: null, crawls: [] }}
      />
    </StoryFrame>
  ),
}
