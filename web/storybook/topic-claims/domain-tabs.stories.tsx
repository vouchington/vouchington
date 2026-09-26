import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DomainTabs } from '@/components/topic-claims/domain-tabs'
import { StoryFrame } from '@/storybook/story-frame'

const token = {
  raw_token: 'voucha-verify-fintech-daily',
  dns_instructions: {
    hostname: '_voucha.fintech.example',
    value: 'voucha-verify=fintech-daily',
  },
  well_known_instructions: {
    url: 'https://fintech.example/.well-known/voucha-verify.txt',
    file_content: 'voucha-verify=fintech-daily',
  },
}

const meta = {
  title: 'Topic Claims/Domain Tabs',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const WithToken: Story = {
  render: () => (
    <StoryFrame>
      <DomainTabs
        hasHostname
        token={token}
        evidence=''
        loading={null}
        copied={false}
        onIssueToken={() => undefined}
        onVerify={() => undefined}
        onCopy={() => undefined}
        onEvidenceChange={() => undefined}
        onManualSubmit={() => undefined}
      />
    </StoryFrame>
  ),
}

export const ManualOnly: Story = {
  render: () => (
    <StoryFrame>
      <DomainTabs
        hasHostname={false}
        token={null}
        evidence='I publish Fintech Daily and can confirm the feed at fintech.example.'
        loading={null}
        copied={false}
        onIssueToken={() => undefined}
        onVerify={() => undefined}
        onCopy={() => undefined}
        onEvidenceChange={() => undefined}
        onManualSubmit={() => undefined}
      />
    </StoryFrame>
  ),
}
