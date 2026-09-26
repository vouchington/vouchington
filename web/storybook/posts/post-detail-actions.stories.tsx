import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostDetailActions } from '@/components/posts/post-detail-actions'
import { getCanonicalPostPath } from '@/lib/post-helpers'
import {
  clearMyCommunitiesFixture,
  setMyCommunitiesFixture,
} from '@/storybook/mocks/client-api-instance'
import { StoryFrame } from '@/storybook/story-frame'
import { commentPost, discussionPost, electionFor, reviewPost } from './fixtures'

const meta = {
  title: 'Posts/Post Detail Actions',
  component: PostDetailActions,
  beforeEach() {
    setMyCommunitiesFixture()
    return () => clearMyCommunitiesFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj

const reviewElection = electionFor(reviewPost)

export const Review: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PostDetailActions
        election={{
          id: reviewElection.id,
          votesCountUp: reviewElection.votes_count_up ?? 0,
          votesCountDown: reviewElection.votes_count_down ?? 0,
        }}
        hideDownCount={false}
        post={{
          id: reviewPost.id,
          postType: 'review',
          canDiscussInCommunity: true,
          discussionSource: {
            title: discussionPost.title,
            canonicalPath: getCanonicalPostPath(discussionPost),
          },
        }}
      />
    </StoryFrame>
  ),
}

export const Comment: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PostDetailActions
        hideDownCount={false}
        post={{
          id: commentPost.id,
          postType: 'comment',
          canDiscussInCommunity: false,
        }}
      />
    </StoryFrame>
  ),
}
