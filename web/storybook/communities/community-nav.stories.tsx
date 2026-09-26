import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityNav } from '@/components/communities/community-nav'
import type { CommunityMember } from '@/types/api-responses'
import { communities } from '@/storybook/entities/fixtures/communities'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Community Nav',
  component: CommunityNav,
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/communities/credit-cards' },
    },
  },
} satisfies Meta<typeof CommunityNav>

export default meta
type Story = StoryObj<typeof meta>

const ownerMembership: CommunityMember = {
  __entity_type: 'community_member',
  id: 'member-owner',
  community_id: communities[0]!.id,
  user_id: storyCurrentUser.id,
  role: 'owner',
  approved_by_id: null,
  created_at: '2026-01-02T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  removed_at: null,
  removed_by_id: null,
}

export const Moderator: Story = {
  args: {
    slug: communities[0]!.slug,
    visibility: 'public',
    newsEnabled: true,
    membership: ownerMembership,
    currentUserRole: 'owner',
    hasPendingApplication: false,
  },
  render: args => (
    <StoryFrame>
      <CommunityNav {...args} />
    </StoryFrame>
  ),
}

export const SignedOut: Story = {
  args: {
    slug: communities[0]!.slug,
    visibility: 'public',
    newsEnabled: true,
    membership: null,
    currentUserRole: null,
    hasPendingApplication: false,
  },
  parameters: { auth: { currentUser: null } },
  render: args => (
    <StoryFrame>
      <CommunityNav {...args} />
    </StoryFrame>
  ),
}
