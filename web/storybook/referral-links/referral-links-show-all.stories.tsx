import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import '@/storybook/mocks/client-api-instance'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { ReferralLinksShowAll } from '@/components/referral-links/referral-links-show-all'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'

const referralProgram = topics.find(topic => topic.topic_type === 'referral_program')!

const meta = {
  title: 'Referral Links/Show All',
  beforeEach() {
    setStoryMutationFixture()
    return () => {
      clearStoryMutationFixture()
    }
  },
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
