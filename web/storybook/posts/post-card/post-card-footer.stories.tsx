import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostCardFooter } from '@/components/posts/post-card/post-card-footer'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import { discussionPost, electionFor, metricsFor, reviewPost } from '../fixtures'

const meta = {
  title: 'Posts/Post Card Footer',
  component: PostCardFooter,
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj

export const Review: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PostCardFooter
        post={reviewPost}
        routePath='review'
        election={electionFor(reviewPost)}
        commentCount={metricsFor(reviewPost).count.descendants}
        hideDownCount={false}
        initialSaved={false}
        initialHidden={false}
      />
    </StoryFrame>
  ),
}

export const Discussion: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PostCardFooter
        post={discussionPost}
        routePath='discussion'
        commentCount={metricsFor(discussionPost).count.descendants}
        hideDownCount={false}
        initialSaved={false}
        initialHidden={false}
      />
    </StoryFrame>
  ),
}
