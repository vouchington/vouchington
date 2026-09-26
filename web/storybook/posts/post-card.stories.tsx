import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostCard } from '@/components/posts/post-card'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import {
  creditCardCommunity,
  dataPointPost,
  electionFor,
  htmlFor,
  metricsFor,
  reviewPost,
} from './fixtures'

const meta = {
  title: 'Posts/Post Card',
  component: PostCard,
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj

export const Review: Story = {
  render: () => (
    <StoryFrame>
      <PostCard
        post={reviewPost}
        html={htmlFor(reviewPost)}
        election={electionFor(reviewPost)}
        metrics={metricsFor(reviewPost)}
        community={creditCardCommunity}
        hideDownCount={false}
      />
    </StoryFrame>
  ),
}

export const DataPoint: Story = {
  render: () => (
    <StoryFrame>
      <PostCard
        post={dataPointPost}
        html={htmlFor(dataPointPost)}
        election={electionFor(dataPointPost)}
        metrics={metricsFor(dataPointPost)}
        hideDownCount={false}
      />
    </StoryFrame>
  ),
}
