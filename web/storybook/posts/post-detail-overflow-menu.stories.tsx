import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { userEvent, within } from 'storybook/test'
import { PostDetailOverflowMenu } from '@/components/posts/post-detail-overflow-menu'
import {
  clearPinnedPostsFixture,
  setPinnedPostsFixture,
} from '@/storybook/mocks/pinned-posts-fixture'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import { creditCardCommunity, discussionPost, postAuthor } from './fixtures'

const meta = {
  title: 'Posts/Post Detail Overflow Menu',
  component: PostDetailOverflowMenu,
  beforeEach() {
    setStoryMutationFixture()
    setPinnedPostsFixture()
    return () => {
      clearStoryMutationFixture()
      clearPinnedPostsFixture()
    }
  },
} satisfies Meta

export default meta
type Story = StoryObj

const moderatorPost = {
  ...discussionPost,
  can_edit_content: true,
  can_delete: true,
  can_lock: true,
  can_unpublish_from_community: true,
  locked_at: null,
}

async function openOverflow({ canvasElement }: { canvasElement: HTMLElement }) {
  await userEvent.click(within(canvasElement).getByRole('button', { name: 'More actions' }))
}

export const Reader: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <PostDetailOverflowMenu post={discussionPost} />
    </StoryFrame>
  ),
  play: openOverflow,
}

function ModeratorMenu() {
  const [isPostPinned, setIsPostPinned] = useState(false)
  return (
    <StoryFrame width='max-w-sm'>
      <PostDetailOverflowMenu
        post={moderatorPost}
        communitySlug={creditCardCommunity.slug}
        isCommunityMod
        isPostPinned={isPostPinned}
        onPinnedChange={setIsPostPinned}
      />
    </StoryFrame>
  )
}

export const Moderator: Story = {
  parameters: { auth: { currentUser: postAuthor } },
  render: () => <ModeratorMenu />,
  play: openOverflow,
}
