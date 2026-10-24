import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityMemberRow } from '@/components/communities/community-member-row'
import { TransferOwnershipDialog } from '@/components/communities/community-transfer-ownership-dialog'
import { useCommunityMembersManager } from '@/components/communities/use-community-members-manager'
import type {
  Community,
  CommunityMember,
  CommunityMembersResponseBody,
} from '@/types/api-responses'
import { page_info, now } from '@/storybook/entities/fixtures/shared'
import { publicUsers, storyCurrentUser } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Community Member Row',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const community: Community = {
  __entity_type: 'community',
  id: 'community-credit-cards',
  name: 'Credit Cards',
  slug: 'credit-cards',
  markdown: null,
  visibility: 'public',
  member_roster_visibility: 'members',
  list_type: 'follow',
  member_invites_allowed_at: null,
  post_approval_required_at: null,
  should_allow_review_posts: true,
  should_allow_data_point_posts: true,
  automod_action: 'record_only',
  trusted_at: null,
  profile_image_id: null,
  banner_image_id: null,
  created_by_id: storyCurrentUser.id,
  created_at: now,
  updated_at: now,
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  rules_markdown: null,
}

const owner: CommunityMember = {
  __entity_type: 'community_member',
  id: 'member-owner',
  community_id: community.id,
  user_id: storyCurrentUser.id,
  role: 'owner',
  approved_by_id: null,
  created_at: now,
  updated_at: now,
  removed_at: null,
  removed_by_id: null,
}

const moderator: CommunityMember = {
  ...owner,
  id: 'member-alex',
  user_id: publicUsers[0]!.id,
  role: 'moderator',
}

const data: CommunityMembersResponseBody = {
  results: [{ __entity_type: 'community_member', id: moderator.id }],
  page_info,
  community_members: { [moderator.id]: moderator },
  users: { [publicUsers[0]!.id]: publicUsers[0]! },
}

function MemberPreview({ dialogOnly }: { dialogOnly: boolean }) {
  const state = useCommunityMembersManager({ community, currentUserMembership: owner, data })
  return (
    <StoryFrame>
      {dialogOnly ? (
        <TransferOwnershipDialog
          community={community}
          member={moderator}
          state={state}
          username={publicUsers[0]!.username}
        />
      ) : (
        <CommunityMemberRow
          community={community}
          currentUserMembership={owner}
          isOwner
          member={moderator}
          state={state}
        />
      )}
    </StoryFrame>
  )
}

export const OwnerManagingModerator: Story = {
  render: () => <MemberPreview dialogOnly={false} />,
}

export const OwnershipTransfer: Story = {
  render: () => <MemberPreview dialogOnly />,
}
