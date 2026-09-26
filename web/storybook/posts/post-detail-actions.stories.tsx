import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostDetailActions } from '@/components/posts/post-detail-actions'
import { getCanonicalPostPath } from '@/lib/post-helpers'
import {
  clearMyCommunitiesFixture,
  setMyCommunitiesFixture,
} from '@/storybook/mocks/client-api-instance'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import { commentPost, electionFor, reviewPost } from './fixtures'

const meta = {
  title: 'Posts/Post Detail Actions',
  component: PostDetailActions,
  beforeEach() {
    setMyCommunitiesFixture()
    setStoryMutationFixture()
    return () => {
      clearMyCommunitiesFixture()
      clearStoryMutationFixture()
    }
  },
} satisfies Meta

export default meta
type Story = StoryObj

const reviewElection = electionFor(reviewPost)

function ReviewActions() {
  const [href, setHref] = useState<string | null>(null)
  if (href) {
    return (
      <StoryFrame width='max-w-xl'>
        <p>Discussion started at {href}</p>
      </StoryFrame>
    )
  }
  return (
    <StoryFrame width='max-w-xl'>
      <PostDetailActions
        election={{
          id: reviewElection.id,
          votesCountUp: reviewElection.votes_count_up ?? 0,
          votesCountDown: reviewElection.votes_count_down ?? 0,
        }}
        hideDownCount={false}
        onDiscussionCreated={setHref}
        post={{
          id: reviewPost.id,
          postType: 'review',
          canDiscussInCommunity: true,
          discussionSource: {
            title: reviewPost.title,
            canonicalPath: getCanonicalPostPath(reviewPost),
          },
        }}
      />
    </StoryFrame>
  )
}

export const Review: Story = {
  render: () => <ReviewActions />,
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
