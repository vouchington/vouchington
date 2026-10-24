import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TransferOwnershipDialog } from '@/components/communities/community-transfer-ownership-dialog'
import { useCommunityMembersManager } from '@/components/communities/use-community-members-manager'
import type { CommunityMember, CommunityMembersResponseBody } from '@/types/api-responses'
import { makeCommunity } from '@/test-helpers/api-responses'
import { communities } from '@/storybook/entities/fixtures/communities'
import { publicUsers, storyCurrentUser } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'

const meta = {
  title: 'Communities/Transfer Ownership Dialog',
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const community = makeCommunity({
  id: communities[0]!.id,
  slug: communities[0]!.slug,
  name: communities[0]!.name,
  visibility: 'public',
})
const moderator: CommunityMember = {
  __entity_type: 'community_member',
  id: 'member-alex',
  community_id: community.id,
  user_id: publicUsers[0]!.id,
  role: 'moderator',
  approved_by_id: storyCurrentUser.id,
  created_at: '2026-05-10T12:00:00.000Z',
  updated_at: '2026-05-10T12:00:00.000Z',
  removed_at: null,
  removed_by_id: null,
}
const ownerMembership: CommunityMember = {
  ...moderator,
  id: 'member-owner',
  user_id: storyCurrentUser.id,
  role: 'owner',
}
const data: CommunityMembersResponseBody = {
  results: [{ __entity_type: 'community_member', id: moderator.id }],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  community_members: { [moderator.id]: moderator },
  users: { [moderator.user_id]: publicUsers[0]! },
}

function TransferPreview() {
  const state = useCommunityMembersManager({
    community,
    currentUserMembership: ownerMembership,
    data,
  })
  return (
    <StoryFrame>
      <TransferOwnershipDialog
        community={community}
        member={moderator}
        state={state}
        username={publicUsers[0]!.username}
      />
    </StoryFrame>
  )
}

export const ToModerator: Story = { render: () => <TransferPreview /> }
