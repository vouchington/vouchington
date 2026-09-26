import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DiscussInCommunityAction } from '@/components/posts/discuss-in-community-action'
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
import { discussionPost } from './fixtures'

const meta = {
  title: 'Posts/Discuss In Community Action',
  component: DiscussInCommunityAction,
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

export const Discussion: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <DiscussInCommunityAction
        postId={discussionPost.id}
        source={{
          title: discussionPost.title,
          canonicalPath: getCanonicalPostPath(discussionPost),
        }}
      />
    </StoryFrame>
  ),
}
