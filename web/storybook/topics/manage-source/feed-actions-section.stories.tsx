import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FeedActionsSection } from '@/components/topics/manage-source/feed-actions-section'
import { StoryFrame } from '@/storybook/story-frame'

const feed = {
  id: 'rss-feed-fintech-daily',
  title: 'Fintech Daily',
  rss_feed_url: { url: 'https://fintech.example/feed/rss' },
  home_page_url: { url: 'https://fintech.example/' },
  is_enabled: true,
  is_discoverable: true,
  last_fetched_at: '2026-05-10T12:00:00.000Z',
  etag: 'W/"fintech-daily"',
  last_modified_at: '2026-05-10T11:00:00.000Z',
}

const meta = {
  title: 'Topics/Feed Actions',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function Actions({ confirmDelete }: { confirmDelete: boolean }) {
  return (
    <StoryFrame>
      <FeedActionsSection
        confirmDelete={confirmDelete}
        deleting={false}
        onConfirmDeleteChange={() => undefined}
        onDelete={() => undefined}
        onRefresh={() => undefined}
        onToggle={() => undefined}
        onToggleDiscoverability={() => undefined}
        refreshing={false}
        rssFeed={feed}
        toggling={false}
        togglingDiscoverability={false}
      />
    </StoryFrame>
  )
}

export const Enabled: Story = {
  render: () => <Actions confirmDelete={false} />,
}

export const ConfirmDelete: Story = {
  render: () => <Actions confirmDelete />,
}
