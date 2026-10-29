import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { CommunityMemberRow } from '@/components/communities/community-member-row'
import { TransferOwnershipDialog } from '@/components/communities/community-transfer-ownership-dialog'
import { useCommunityMembersManager } from '@/components/communities/use-community-members-manager'
import type { CommunityMember, CommunityMembersResponseBody } from '@/types/api-responses'
import { makeCommunity } from '@/test-helpers/api-responses'
import { communities } from '@/storybook/entities/fixtures/communities'
import { publicUsers, storyCurrentUser } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'
import {
  clearModerationContextFixture,
  setModerationContextFixture,
} from '@/storybook/mocks/client-api-instance'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'

const meta = {
  title: 'Communities/Community Member Row',
  beforeEach() {
    setModerationContextFixture()
    setStoryMutationFixture()
    return () => {
      clearModerationContextFixture()
      clearStoryMutationFixture()
    }
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
const member: CommunityMember = {
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
  ...member,
  id: 'member-owner',
  user_id: storyCurrentUser.id,
  role: 'owner',
}
const data: CommunityMembersResponseBody = {
  results: [{ __entity_type: 'community_member', id: member.id }],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  community_members: { [member.id]: member },
  users: { [member.user_id]: publicUsers[0]! },
}
const regularMember: CommunityMember = { ...member, role: 'member' }
const regularMemberData: CommunityMembersResponseBody = {
  ...data,
  community_members: { [regularMember.id]: regularMember },
}

function OwnerView({
  memberRole,
  transferDialog = false,
}: {
  memberRole: 'member' | 'moderator'
  transferDialog?: boolean
}) {
  const row = memberRole === 'member' ? regularMember : member
  const state = useCommunityMembersManager({
    community,
    currentUserMembership: ownerMembership,
    data: memberRole === 'member' ? regularMemberData : data,
  })
  return (
    <StoryFrame>
      {transferDialog ? (
        <TransferOwnershipDialog
          community={community}
          member={row}
          state={state}
          username={publicUsers[0]!.username}
        />
      ) : (
        <CommunityMemberRow
          community={community}
          currentUserMembership={ownerMembership}
          isOwner
          member={row}
          state={state}
        />
      )}
    </StoryFrame>
  )
}

export const ModeratorManagedByOwner: Story = {
  render: () => <OwnerView memberRole='moderator' />,
}

export const MemberManagedByOwner: Story = {
  render: () => <OwnerView memberRole='member' />,
}

export const OwnershipTransfer: Story = {
  render: () => (
    <OwnerView
      memberRole='moderator'
      transferDialog
    />
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: /transfer ownership/i }),
    )
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole('alertdialog', {
        name: /transfer ownership/i,
      }),
    ).toBeVisible()
  },
}
