import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ApplicationForm } from '@/components/communities/application-form'
import type { CommunityApplicationQuestion } from '@/types/api-responses'
import { now } from '@/storybook/entities/fixtures/shared'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Application Form',
  component: ApplicationForm,
} satisfies Meta<typeof ApplicationForm>

export default meta
type Story = StoryObj<typeof meta>

const questions: CommunityApplicationQuestion[] = [
  {
    id: 'experience',
    community_id: 'community-credit-cards',
    question: 'What would you share?',
    field_type: 'short_text',
    options: null,
    order_index: 0,
    is_required: true,
    created_at: now,
  },
  {
    id: 'interests',
    community_id: 'community-credit-cards',
    question: 'Which topics interest you?',
    field_type: 'multi_select',
    options: ['Travel rewards', 'Cash back', 'Credit building'],
    order_index: 1,
    is_required: false,
    created_at: now,
  },
  {
    id: 'rules',
    community_id: 'community-credit-cards',
    question: 'Have you read the rules?',
    field_type: 'checkbox',
    options: null,
    order_index: 2,
    is_required: true,
    created_at: now,
  },
]

export const WithQuestions: Story = {
  args: { communitySlug: 'credit-cards', questions },
  render: args => (
    <StoryFrame width='max-w-xl'>
      <ApplicationForm {...args} />
    </StoryFrame>
  ),
}

export const MessageOnly: Story = {
  args: { communitySlug: 'credit-cards', questions: [] },
  render: args => (
    <StoryFrame width='max-w-xl'>
      <ApplicationForm {...args} />
    </StoryFrame>
  ),
}
