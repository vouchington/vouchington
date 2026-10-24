import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { InviteItem } from '@/components/communities/invite-item'
import type { CommunityInvite } from '@/types/api-responses'
import { communities } from '@/storybook/entities/fixtures/communities'
import { publicUsers, storyCurrentUser } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Invite Item',
  component: InviteItem,
  render: args => (
    <StoryFrame width='max-w-xl'>
      <InviteItem {...args} />
    </StoryFrame>
  ),
} satisfies Meta<typeof InviteItem>

export default meta
type Story = StoryObj<typeof meta>

const invite: CommunityInvite = {
  __entity_type: 'community_invite',
  id: 'invite-alex',
  community_id: communities[0]!.id,
  invited_user_id: publicUsers[0]!.id,
  invited_email: null,
  invited_by_id: storyCurrentUser.id,
  accepted_at: null,
  accepted_by_id: null,
  declined_at: null,
  revoked_at: null,
  created_at: '2026-05-24T00:00:00.000Z',
}

export const Pending: Story = {
  args: { invite, loading: false, onRevoke: () => {} },
}

export const Revoked: Story = {
  args: {
    invite: { ...invite, revoked_at: '2026-05-25T00:00:00.000Z' },
    loading: false,
    onRevoke: () => {},
  },
}
