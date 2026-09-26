import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunitySettingsForm } from '@/components/communities/community-settings-form'
import type { Community } from '@/types/api-responses'
import { communities } from '@/storybook/entities/fixtures/communities'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Community Settings Form',
  component: CommunitySettingsForm,
} satisfies Meta<typeof CommunitySettingsForm>

export default meta
type Story = StoryObj<typeof meta>

const community: Community = {
  __entity_type: 'community',
  id: communities[0]!.id,
  name: communities[0]!.name,
  slug: communities[0]!.slug,
  markdown: 'A public community for card reviews and application data points.',
  visibility: 'public',
  member_roster_visibility: 'members',
  list_type: 'topics',
  member_invites_allowed_at: '2026-02-01T00:00:00.000Z',
  post_approval_required_at: '2026-02-01T00:00:00.000Z',
  allow_review_posts: true,
  allow_data_point_posts: true,
  trusted_at: '2026-03-01T00:00:00.000Z',
  profile_image_id: null,
  banner_image_id: null,
  created_by_id: storyCurrentUser.id,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  rules_markdown: 'Share your own data points. Put referral links in a review.',
}

export const Active: Story = {
  args: { community },
  render: args => (
    <StoryFrame>
      <CommunitySettingsForm {...args} />
    </StoryFrame>
  ),
}

export const Archived: Story = {
  args: {
    community: {
      ...community,
      archived_at: '2026-06-01T00:00:00.000Z',
      archived_by_id: storyCurrentUser.id,
    },
  },
  render: args => (
    <StoryFrame>
      <CommunitySettingsForm {...args} />
    </StoryFrame>
  ),
}
