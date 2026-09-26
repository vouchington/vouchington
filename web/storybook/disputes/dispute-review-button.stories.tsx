import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DisputeReviewButton } from '@/components/disputes/dispute-review-button'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { posts } from '@/storybook/entities/fixtures/posts'
import { topics } from '@/storybook/entities/fixtures/topics'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Disputes/Dispute Review Button',
  component: DisputeReviewButton,
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta<typeof DisputeReviewButton>

export default meta
type Story = StoryObj<typeof meta>

export const SapphireReserveReview: Story = {
  args: { postId: posts[1]!.id, topicId: topics[1]!.id },
  render: args => (
    <StoryFrame width='max-w-sm'>
      <DisputeReviewButton {...args} />
    </StoryFrame>
  ),
}
