import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ApplicationReview } from '@/components/communities/application-review'
import type { CommunityApplicationsResponseBody } from '@/types/api-responses'
import { communities } from '@/storybook/entities/fixtures/communities'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import { page_info } from '@/storybook/entities/fixtures/shared'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Application Review',
  component: ApplicationReview,
} satisfies Meta<typeof ApplicationReview>

export default meta
type Story = StoryObj<typeof meta>

const pendingApplication: CommunityApplicationsResponseBody['community_applications'][string] = {
  __entity_type: 'community_application',
  id: 'application-alex',
  community_id: communities[0]!.id,
  user_id: publicUsers[0]!.id,
  answers: { 'What would you share?': 'My experience with travel rewards' },
  message: 'I would like to compare the cards I have used.',
  reviewed_at: null,
  reviewed_by_id: null,
  approved_at: null,
  rejected_at: null,
  rejection_reason: null,
  created_at: '2026-05-10T12:00:00.000Z',
}

const withApplications: CommunityApplicationsResponseBody = {
  results: [{ __entity_type: 'community_application', id: pendingApplication.id }],
  page_info,
  community_applications: { [pendingApplication.id]: pendingApplication },
}

export const Pending: Story = {
  args: {
    communitySlug: communities[0]!.slug,
    data: withApplications,
    users: { [publicUsers[0]!.id]: publicUsers[0]! },
  },
  render: args => (
    <StoryFrame>
      <ApplicationReview {...args} />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  args: {
    communitySlug: communities[0]!.slug,
    data: { results: [], page_info, community_applications: {} },
  },
  render: args => (
    <StoryFrame>
      <ApplicationReview {...args} />
    </StoryFrame>
  ),
}
