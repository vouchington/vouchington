import type { FormEvent } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AdditionalDomains } from '@/components/topics/manage-source/additional-domains-section'
import { StoryFrame } from '@/storybook/story-frame'
import { now } from '@/storybook/entities/fixtures/shared'
import { topics } from '@/storybook/entities/fixtures/topics'

const topic = topics.find(item => item.topic_type === 'rss_feed')!
const prevent = (event: FormEvent) => event.preventDefault()

const meta = {
  title: 'Topics/Additional Domains',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const shared = {
  addingHostname: false,
  onAddHostname: prevent,
  onRemoveHostname: () => undefined,
  removingHostnameId: null,
  hasNextPage: false,
  endCursor: null,
  onLoadMore: async () => undefined,
  loadingMore: false,
  fetchError: null,
  clearError: () => undefined,
}

export const Linked: Story = {
  render: () => (
    <StoryFrame>
      <AdditionalDomains
        {...shared}
        additionalHostnames={[
          {
            hostname_id: 'hostname-amex',
            hostname: 'americanexpress.com',
            topic_id: topic.id,
            created_at: now,
          },
        ]}
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <AdditionalDomains
        {...shared}
        additionalHostnames={[]}
      />
    </StoryFrame>
  ),
}
