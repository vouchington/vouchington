import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { LinkValidationForm } from '@/components/referral-links/validations/link-validation-form'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'

const referralProgram = topics.find(topic => topic.topic_type === 'referral_program')!

const meta = {
  title: 'Referral Links/Link Validation Form',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <LinkValidationForm referralProgramId={referralProgram.id} />
    </StoryFrame>
  ),
}
