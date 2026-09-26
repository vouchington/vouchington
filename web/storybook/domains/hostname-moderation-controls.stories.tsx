import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { HostnameModerationControls } from '@/components/domains/hostname-moderation-controls'
import { hostnames } from '@/storybook/entities/fixtures/hostnames'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Domains/Hostname Moderation Controls',
  component: HostnameModerationControls,
} satisfies Meta<typeof HostnameModerationControls>

export default meta
type Story = StoryObj<typeof meta>

const openHost = hostnames[0]!
const blockedHost = hostnames[1]!

export const Crawlable: Story = {
  args: {
    hostnameId: openHost.id,
    blocked: openHost.blocked,
    crawlable: openHost.crawlable,
    linkRelFollow: openHost.link_rel_follow,
  },
  render: args => (
    <StoryFrame>
      <HostnameModerationControls {...args} />
    </StoryFrame>
  ),
}

export const Blocked: Story = {
  args: {
    hostnameId: blockedHost.id,
    blocked: true,
    crawlable: false,
    linkRelFollow: false,
  },
  render: args => (
    <StoryFrame>
      <HostnameModerationControls {...args} />
    </StoryFrame>
  ),
}
