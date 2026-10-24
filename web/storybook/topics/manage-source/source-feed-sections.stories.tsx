import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SourceFeedSections } from '@/components/topics/manage-source/source-feed-sections'
import { useManageSourcePage } from '@/components/topics/manage-source/use-manage-source-page'
import type { ManageSourceState } from '@/components/topics/manage-source/manage-source-model'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'

const feed = topics.find(topic => topic.topic_type === 'rss_feed')!

function Sections({ id, initialData }: { id: string; initialData: Partial<ManageSourceState> }) {
  const { handlers, state } = useManageSourcePage(id, initialData)
  return (
    <StoryFrame>
      <SourceFeedSections
        id={id}
        handlers={handlers}
        state={state}
      />
    </StoryFrame>
  )
}

const meta = {
  title: 'Topics/Source Feed Sections',
  component: Sections,
} satisfies Meta<typeof Sections>

export default meta
type Story = StoryObj<typeof meta>

export const LinkedFeed: Story = {
  args: {
    id: feed.id,
    initialData: {
      loading: false,
      loadError: null,
      rssFeed: {
        id: 'rss-feed-fintech-daily',
        title: 'Fintech Daily',
        rss_feed_url: { url: 'https://fintech.example/feed/rss' },
        home_page_url: { url: 'https://fintech.example/' },
        is_enabled: true,
        is_discoverable: true,
        last_fetched_at: '2026-05-10T12:00:00.000Z',
        etag: 'W/"fintech-daily"',
        last_modified_at: '2026-05-10T11:00:00.000Z',
      },
      crawls: [],
    },
  },
  render: args => <Sections {...args} />,
}
