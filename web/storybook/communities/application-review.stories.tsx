import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ApplicationReview } from '@/components/communities/application-review'
import type { CommunityApplicationSummary } from '@/types/api-responses'
import type { CommunityApplicationsResponseBody } from '@/types/api-responses/community-applications'
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

const application: CommunityApplicationSummary = {
  __entity_type: 'community_application_summary',
  id: 'application-alex',
  user_id: publicUsers[0]!.id,
  status: 'pending',
  message_preview: 'I would like to compare real redemption experiences with other members.',
  answer_count: 1,
  created_at: '2026-05-24T00:00:00.000Z',
}

const pending: CommunityApplicationsResponseBody = {
  results: [{ __entity_type: 'community_application_summary', id: application.id }],
  page_info,
  community_application_summaries: { [application.id]: application },
  users: { [publicUsers[0]!.id]: publicUsers[0]! },
}

export const Pending: Story = {
  args: {
    communitySlug: communities[0]!.slug,
    data: pending,
  },
}

export const Empty: Story = {
  args: {
    communitySlug: communities[0]!.slug,
    data: { results: [], page_info, community_application_summaries: {}, users: {} },
  },
}
