import type { FormEvent } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DomainsSection } from '@/components/topics/manage-source/domains-section'
import { StoryFrame } from '@/storybook/story-frame'
import { now } from '@/storybook/entities/fixtures/shared'
import { topics } from '@/storybook/entities/fixtures/topics'

const topic = topics.find(item => item.topic_type === 'rss_feed')!
const prevent = (event: FormEvent) => event.preventDefault()

const meta = {
  title: 'Topics/Domains Section',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const shared = {
  addingHostname: false,
  onAddHostname: prevent,
  onPrimaryHostnameSubmit: prevent,
  onRemoveHostname: () => undefined,
  primaryHostnameSaving: false,
  removingHostnameId: null,
  hasNextHostnamesPage: false,
  hostnamesEndCursor: null,
  onLoadMoreHostnames: async () => undefined,
  loadingMoreHostnames: false,
  hostnamesFetchError: null,
  onClearHostnamesError: () => undefined,
}

export const PrimaryAndAdditional: Story = {
  render: () => (
    <StoryFrame>
      <DomainsSection
        {...shared}
        primaryHostname={{ id: 'hostname-fintech-example', hostname: 'fintech.example' }}
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

export const MissingPrimary: Story = {
  render: () => (
    <StoryFrame>
      <DomainsSection
        {...shared}
        primaryHostname={null}
        additionalHostnames={[]}
      />
    </StoryFrame>
  ),
}
