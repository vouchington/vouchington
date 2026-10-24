import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ApplicationReview } from '@/components/communities/application-review'
import type { CommunityApplication, CommunityApplicationsResponseBody } from '@/types/api-responses'
import { communities } from '@/storybook/entities/fixtures/communities'
import { page_info } from '@/storybook/entities/fixtures/shared'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Application Review',
  component: ApplicationReview,
  render: args => (
    <StoryFrame width='max-w-xl'>
      <ApplicationReview {...args} />
    </StoryFrame>
  ),
} satisfies Meta<typeof ApplicationReview>

export default meta
type Story = StoryObj<typeof meta>

const application: CommunityApplication = {
  __entity_type: 'community_application',
  id: 'application-alex',
  community_id: communities[0]!.id,
  user_id: publicUsers[0]!.id,
  answers: { 'Travel interests': 'Airline points and hotel status' },
  message: 'I would like to compare real redemption experiences with other members.',
  reviewed_at: null,
  reviewed_by_id: null,
  approved_at: null,
  rejected_at: null,
  rejection_reason: null,
  created_at: '2026-05-24T00:00:00.000Z',
}

const pending: CommunityApplicationsResponseBody = {
  results: [{ __entity_type: 'community_application', id: application.id }],
  page_info,
  community_applications: { [application.id]: application },
}

export const Pending: Story = {
  args: {
    communitySlug: communities[0]!.slug,
    data: pending,
    users: { [publicUsers[0]!.id]: publicUsers[0]! },
  },
}

export const Empty: Story = {
  args: {
    communitySlug: communities[0]!.slug,
    data: { results: [], page_info, community_applications: {} },
    users: {},
  },
}
