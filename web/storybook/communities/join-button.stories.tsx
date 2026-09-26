import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import JoinButton from '@/components/communities/join-button'
import type { CommunityMember } from '@/types/api-responses'
import { communities } from '@/storybook/entities/fixtures/communities'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Join Button',
  component: JoinButton,
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta<typeof JoinButton>

export default meta
type Story = StoryObj<typeof meta>

const membership: CommunityMember = {
  __entity_type: 'community_member',
  id: 'member-cardholder',
  community_id: communities[0]!.id,
  user_id: storyCurrentUser.id,
  role: 'member',
  approved_by_id: null,
  created_at: '2026-02-02T00:00:00.000Z',
  updated_at: '2026-02-02T00:00:00.000Z',
  removed_at: null,
  removed_by_id: null,
}

export const Join: Story = {
  args: {
    communitySlug: communities[0]!.slug,
    visibility: 'public',
    membership: null,
  },
  render: args => (
    <StoryFrame width='max-w-xs'>
      <JoinButton {...args} />
    </StoryFrame>
  ),
}

export const Member: Story = {
  args: {
    communitySlug: communities[0]!.slug,
    visibility: 'public',
    membership,
  },
  render: args => (
    <StoryFrame width='max-w-xs'>
      <JoinButton {...args} />
    </StoryFrame>
  ),
}

export const SignedOut: Story = {
  args: {
    communitySlug: communities[0]!.slug,
    visibility: 'public',
    membership: null,
  },
  parameters: { auth: { currentUser: null } },
  render: args => (
    <StoryFrame width='max-w-xs'>
      <JoinButton {...args} />
    </StoryFrame>
  ),
}
