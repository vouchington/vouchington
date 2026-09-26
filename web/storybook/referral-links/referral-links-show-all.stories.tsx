import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ReferralLinksShowAll } from '@/components/referral-links/referral-links-show-all'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'

const referralProgram = topics.find(topic => topic.topic_type === 'referral_program')!

const meta = {
  title: 'Referral Links/Show All',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ReadyToLoad: Story = {
  render: () => (
    <StoryFrame>
      <ReferralLinksShowAll referralProgramId={referralProgram.id} />
    </StoryFrame>
  ),
}
