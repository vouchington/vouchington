import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ReferralValidationsSettings } from '@/components/topics/settings/referral-validations-settings'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import { now } from '@/storybook/entities/fixtures/shared'
import { topics } from '@/storybook/entities/fixtures/topics'

const program = topics.find(topic => topic.topic_type === 'referral_program')!

const meta = {
  title: 'Topics/Referral Validations',
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Linked: Story = {
  render: () => (
    <StoryFrame>
      <ReferralValidationsSettings
        referralProgramId={program.id}
        validationsBasePath='/referral-program/amex-referrals/validations'
        linkedValidations={[
          {
            id: 'validation-chase-sapphire',
            slug: 'chase-sapphire-reserve',
            user_help_text: 'Use the public referral link from your Sapphire Reserve account.',
            updated_at: now,
          },
        ]}
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <ReferralValidationsSettings
        referralProgramId={program.id}
        validationsBasePath='/referral-program/amex-referrals/validations'
        linkedValidations={[]}
      />
    </StoryFrame>
  ),
}
