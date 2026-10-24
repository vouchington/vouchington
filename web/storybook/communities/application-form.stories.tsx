import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ApplicationForm } from '@/components/communities/application-form'
import type { CommunityApplicationQuestion } from '@/types/api-responses'
import { communities } from '@/storybook/entities/fixtures/communities'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Application Form',
  component: ApplicationForm,
  render: args => (
    <StoryFrame width='max-w-xl'>
      <ApplicationForm {...args} />
    </StoryFrame>
  ),
} satisfies Meta<typeof ApplicationForm>

export default meta
type Story = StoryObj<typeof meta>

const questions: CommunityApplicationQuestion[] = [
  {
    id: 'application-question-experience',
    community_id: communities[0]!.id,
    question: 'Which credit cards have you used for travel?',
    field_type: 'long_text',
    options: null,
    order_index: 0,
    is_required: true,
    created_at: '2026-05-01T00:00:00.000Z',
  },
  {
    id: 'application-question-focus',
    community_id: communities[0]!.id,
    question: 'What would you like to discuss?',
    field_type: 'single_select',
    options: ['Points transfers', 'Annual fees', 'Travel insurance'],
    order_index: 1,
    is_required: false,
    created_at: '2026-05-01T00:00:00.000Z',
  },
]

export const WithQuestions: Story = {
  args: { communitySlug: communities[0]!.slug, questions },
}

export const MessageOnly: Story = {
  args: { communitySlug: communities[0]!.slug, questions: [] },
}
