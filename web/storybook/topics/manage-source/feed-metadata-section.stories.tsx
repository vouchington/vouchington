import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FeedMetadataSection } from '@/components/topics/manage-source/feed-metadata-section'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Topics/Feed Metadata',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Fetched: Story = {
  render: () => (
    <StoryFrame>
      <FeedMetadataSection
        rssFeed={{
          id: 'rss-feed-fintech-daily',
          title: 'Fintech Daily',
          rss_feed_url: { url: 'https://fintech.example/feed/rss' },
          home_page_url: { url: 'https://fintech.example/' },
          is_enabled: true,
          is_discoverable: true,
          last_fetched_at: '2026-05-10T12:00:00.000Z',
          etag: 'W/"fintech-daily"',
          last_modified_at: '2026-05-10T11:00:00.000Z',
        }}
      />
    </StoryFrame>
  ),
}

export const NeverFetched: Story = {
  render: () => (
    <StoryFrame>
      <FeedMetadataSection
        rssFeed={{
          id: 'rss-feed-fintech-daily',
          title: null,
          rss_feed_url: { url: 'https://fintech.example/feed/rss' },
          home_page_url: null,
          is_enabled: false,
          is_discoverable: false,
          last_fetched_at: null,
          etag: null,
          last_modified_at: null,
        }}
      />
    </StoryFrame>
  ),
}
