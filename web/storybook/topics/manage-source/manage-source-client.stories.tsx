import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ManageSourceClient } from '@/components/topics/manage-source/manage-source-client'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'
import { now } from '@/storybook/entities/fixtures/shared'

const feed = topics.find(topic => topic.topic_type === 'rss_feed')!

const meta = {
  title: 'Topics/Manage Source Client',
  component: ManageSourceClient,
} satisfies Meta<typeof ManageSourceClient>

export default meta
type Story = StoryObj<typeof meta>

export const LinkedFeed: Story = {
  args: {
    id: feed.id,
    initialData: {
      loading: false,
      loadError: null,
      primaryHostname: { id: 'hostname-fintech-example', hostname: 'fintech.example' },
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
    },
  },
  render: args => (
    <StoryFrame>
      <ManageSourceClient {...args} />
    </StoryFrame>
  ),
}
