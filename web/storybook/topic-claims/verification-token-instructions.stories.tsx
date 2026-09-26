import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  DnsInstructions,
  WellKnownInstructions,
} from '@/components/topic-claims/verification-token-instructions'
import { StoryFrame } from '@/storybook/story-frame'

const token = {
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
  title: 'Topic Claims/Verification Token Instructions',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Ready: Story = {
  render: () => (
    <StoryFrame>
      <div className='space-y-6'>
        <DnsInstructions
          token={token}
          copied={false}
          loadingVerify={false}
          onCopy={() => undefined}
          onVerify={() => undefined}
        />
        <WellKnownInstructions
          token={token}
          loadingVerify={false}
          onVerify={() => undefined}
        />
      </div>
    </StoryFrame>
  ),
}

export const Copied: Story = {
  render: () => (
    <StoryFrame>
      <div className='space-y-6'>
        <DnsInstructions
          token={token}
          copied
          loadingVerify={false}
          onCopy={() => undefined}
          onVerify={() => undefined}
        />
        <WellKnownInstructions
          token={token}
          loadingVerify
          onVerify={() => undefined}
        />
      </div>
    </StoryFrame>
  ),
}
