import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityDangerZone } from '@/components/communities/community-danger-zone'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Community Danger Zone',
  component: CommunityDangerZone,
} satisfies Meta<typeof CommunityDangerZone>

export default meta
type Story = StoryObj<typeof meta>

const idle = {
  confirmArchive: false,
  error: null,
  handleArchive: () => {},
  isBusy: false,
  loading: false,
}

export const Archive: Story = {
  args: { ...idle, isArchived: false },
  render: args => (
    <StoryFrame>
      <CommunityDangerZone {...args} />
    </StoryFrame>
  ),
}

export const Restore: Story = {
  args: { ...idle, isArchived: true },
  render: args => (
    <StoryFrame>
      <CommunityDangerZone {...args} />
    </StoryFrame>
  ),
}

export const ArchiveError: Story = {
  args: {
    ...idle,
    isArchived: false,
    error: 'Credit Cards still has an open modmail thread about a Sapphire Reserve referral.',
  },
  render: args => (
    <StoryFrame>
      <CommunityDangerZone {...args} />
    </StoryFrame>
  ),
}
