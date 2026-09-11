import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityRaidModeActiveList } from '@/components/communities/community-raid-mode-active-list'
import { CommunityRaidModeForm } from '@/components/communities/community-raid-mode-form'
import { CommunityRaidModePanel } from '@/components/communities/community-raid-mode-panel'
import type { RaidModeState } from '@/components/communities/community-raid-mode-state'
import type {
  Community,
  CommunityRestriction,
  CommunityRestrictionsResponseBody,
} from '@/types/api-responses'
import { EntityStoryFrame } from './entity-story-frame'

const meta = {
  title: 'Entities/Communities/Raid Mode',
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

const restriction: CommunityRestriction = {
  __entity_type: 'community_restriction',
  id: 'restriction-1',
  community_id: community.id,
  restriction_type: 'no_links',
  activated_by_id: 'user-owner',
  activated_at: '2026-06-07T12:00:00.000Z',
  expires_at: '2026-06-10T12:00:00.000Z',
  created_at: '2026-06-07T12:00:00.000Z',
  updated_at: '2026-06-07T12:00:00.000Z',
  lifted_at: null,
  lifted_by_id: null,
  reason: 'Coordinated spam campaign',
}

const restrictionsData: CommunityRestrictionsResponseBody = {
  results: [{ __entity_type: 'community_restriction', id: restriction.id }],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  community_restrictions: { [restriction.id]: restriction },
  raid_mode_suggestion: {
    velocity_spike: true,
    flag_count: 4,
    latest_flagged_at: '2026-06-07T12:30:00.000Z',
  },
}

const formState: RaidModeState = {
  selectedTypes: new Set(['no_links', 'no_new_member_posts']),
  duration: '24h',
  reason: 'Coordinated spam campaign',
  liftingId: null,
  isSaving: false,
}

export const ActiveWithSuggestion: Story = {
  render: () => (
    <EntityStoryFrame
      title='Raid Mode'
      description='Temporary restrictions and velocity-spike suggestions on the community moderation page.'
    >
      <CommunityRaidModePanel
        community={community}
        initialData={restrictionsData}
      />
    </EntityStoryFrame>
  ),
}

export const ActivationForm: Story = {
  render: () => (
    <EntityStoryFrame
      title='Raid Mode Activation Form'
      description='Moderator controls for choosing restriction types, duration, and a reason.'
    >
      <CommunityRaidModeForm
        state={formState}
        isBusy={false}
        onSubmit={event => event.preventDefault()}
        onToggle={() => {}}
        onDurationChange={() => {}}
        onReasonChange={() => {}}
      />
    </EntityStoryFrame>
  ),
}

export const ActiveRestrictions: Story = {
  render: () => (
    <EntityStoryFrame
      title='Active Raid Mode Restrictions'
      description='The active restriction list moderators use to lift raid-mode rules.'
    >
      <CommunityRaidModeActiveList
        restrictions={[restriction]}
        liftingId={null}
        isBusy={false}
        onLift={() => {}}
      />
    </EntityStoryFrame>
  ),
}
