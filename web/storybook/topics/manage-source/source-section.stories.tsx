import type { FormEvent } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SourceSection } from '@/components/topics/manage-source/source-section'
import { StoryFrame } from '@/storybook/story-frame'

const prevent = (event: FormEvent) => event.preventDefault()

const meta = {
  title: 'Topics/Source Section',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const LinkedFeed: Story = {
  render: () => (
    <StoryFrame>
      <SourceSection
        saving={false}
        onSubmit={prevent}
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

export const MissingFeed: Story = {
  render: () => (
    <StoryFrame>
      <SourceSection
        saving={false}
        onSubmit={prevent}
        rssFeed={null}
      />
    </StoryFrame>
  ),
}
