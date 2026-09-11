import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { BanDialog } from '@/components/communities/community-ban-dialog'
import { CommunityBansPanel } from '@/components/communities/community-bans-panel'
import type {
  Community,
  CommunityBan,
  CommunityBansResponseBody,
  CommunityMember,
} from '@/types/api-responses'
import type { CommunityMembersManagerState } from '@/components/communities/use-community-members-manager'
import { EntityStoryFrame } from './entity-story-frame'

const meta = {
  title: 'Entities/Communities/Bans',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const community: Community = {
  __entity_type: 'community',
  id: 'community-1',
  name: 'Credit Cards',
  slug: 'credit-cards',
  markdown: null,
  visibility: 'public',
  member_roster_visibility: 'public',
  list_type: null,
  member_invites_allowed_at: null,
  post_approval_required_at: null,
  allow_review_posts: true,
  allow_data_point_posts: true,
  trusted_at: null,
  profile_image_id: null,
  banner_image_id: null,
  created_by_id: 'user-owner',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  rules_markdown: null,
}

const member: CommunityMember = {
  __entity_type: 'community_member',
  id: 'member-1',
  community_id: 'community-1',
  user_id: 'user-2',
  role: 'member',
  approved_by_id: null,
  created_at: '2026-01-02T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  removed_at: null,
  removed_by_id: null,
}

const mockState = {
  banDialogUserId: null,
  setBanDialogUserId: fn<(id: string | null) => void>(),
  handleBan:
    fn<(userId: string, opts?: { reason?: string; expiresAt?: string }) => Promise<void>>(),
  loading: null,
} as unknown as CommunityMembersManagerState

const mockStateOpen = {
  ...mockState,
  banDialogUserId: member.user_id,
} as unknown as CommunityMembersManagerState

export const BanDialogClosed: Story = {
  render: () => (
    <EntityStoryFrame title='Ban Dialog (closed)'>
      <BanDialog
        banLoading={false}
        community={community}
        member={member}
        state={mockState}
        username='testuser'
      />
    </EntityStoryFrame>
  ),
}

export const BanDialogOpen: Story = {
  render: () => (
    <EntityStoryFrame title='Ban Dialog (open)'>
      <BanDialog
        banLoading={false}
        community={community}
        member={member}
        state={mockStateOpen}
        username='testuser'
      />
    </EntityStoryFrame>
  ),
}

const ban1: CommunityBan = {
  __entity_type: 'community_ban',
  id: 'ban-1',
  community_id: 'community-1',
  user_id: 'user-2',
  banned_by_id: 'user-owner',
  case_id: '00000000-0000-0000-0000-000000000001',
  reason: 'Repeated spam',
  expires_at: null,
  created_at: '2026-05-01T10:00:00.000Z',
  updated_at: '2026-05-01T10:00:00.000Z',
  lifted_at: null,
  lifted_by_id: null,
}

const ban2: CommunityBan = {
  __entity_type: 'community_ban',
  id: 'ban-2',
  community_id: 'community-1',
  user_id: 'user-3',
  banned_by_id: 'user-owner',
  case_id: '00000000-0000-0000-0000-000000000002',
  reason: null,
  expires_at: '2026-07-01T00:00:00.000Z',
  created_at: '2026-06-01T10:00:00.000Z',
  updated_at: '2026-06-01T10:00:00.000Z',
  lifted_at: null,
  lifted_by_id: null,
}

const ban3: CommunityBan = {
  __entity_type: 'community_ban',
  id: 'ban-3',
  community_id: 'community-1',
  user_id: 'user-4',
  banned_by_id: 'user-owner',
  case_id: '00000000-0000-0000-0000-000000000003',
  reason: 'Off-topic posts',
  expires_at: null,
  created_at: '2026-04-01T10:00:00.000Z',
  updated_at: '2026-04-15T10:00:00.000Z',
  lifted_at: '2026-04-15T10:00:00.000Z',
  lifted_by_id: 'user-owner',
}
const withBansData: CommunityBansResponseBody = {
  results: [
    { __entity_type: 'community_ban', id: ban1.id },
    { __entity_type: 'community_ban', id: ban2.id },
    { __entity_type: 'community_ban', id: ban3.id },
  ],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  community_bans: { [ban1.id]: ban1, [ban2.id]: ban2, [ban3.id]: ban3 },
  users: {
    'user-2': {
      id: 'user-2',
      username: 'spammer123',
    } as unknown as CommunityBansResponseBody['users'][string],
    'user-3': {
      id: 'user-3',
      username: 'off-topic-user',
    } as unknown as CommunityBansResponseBody['users'][string],
    'user-4': {
      id: 'user-4',
      username: 'formerly-banned',
    } as unknown as CommunityBansResponseBody['users'][string],
  },
}

const emptyBansData: CommunityBansResponseBody = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  community_bans: {},
  users: {},
}

export const BansPanelWithBans: Story = {
  render: () => (
    <EntityStoryFrame title='Ban History — With bans'>
      <CommunityBansPanel
        community={community}
        initialData={withBansData}
      />
    </EntityStoryFrame>
  ),
}

export const BansPanelEmpty: Story = {
  render: () => (
    <EntityStoryFrame
      title='Ban History — Empty'
      description='No bans on record.'
    >
      <CommunityBansPanel
        community={community}
        initialData={emptyBansData}
      />
    </EntityStoryFrame>
  ),
}
