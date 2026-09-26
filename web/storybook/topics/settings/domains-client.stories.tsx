import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DomainsClient } from '@/components/topics/settings/domains-client'
import { StoryFrame } from '@/storybook/story-frame'
import { now } from '@/storybook/entities/fixtures/shared'
import { topics } from '@/storybook/entities/fixtures/topics'

const feed = topics.find(topic => topic.topic_type === 'rss_feed')!

const meta = {
  title: 'Topics/Domains',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const FintechDaily: Story = {
  render: () => (
    <StoryFrame>
      <DomainsClient
        id={feed.id}
        initialData={{
          loading: false,
          loadError: null,
          primaryHostname: { id: 'hostname-fintech-example', hostname: 'fintech.example' },
          additionalHostnames: [
            {
              hostname_id: 'hostname-amex',
              hostname: 'americanexpress.com',
              topic_id: feed.id,
              created_at: now,
            },
          ],
          additionalHostnamesPageInfo: { has_next_page: false, end_cursor: null },
        }}
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <DomainsClient
        id={feed.id}
        initialData={{
          loading: false,
          loadError: null,
          primaryHostname: null,
          additionalHostnames: [],
          additionalHostnamesPageInfo: { has_next_page: false, end_cursor: null },
        }}
      />
    </StoryFrame>
  ),
}
