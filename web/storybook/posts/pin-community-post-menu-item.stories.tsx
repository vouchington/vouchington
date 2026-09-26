import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PinCommunityPostMenuItem } from '@/components/posts/pin-community-post-menu-item'
import {
  clearPinnedPostsFixture,
  setPinnedPostsFixture,
} from '@/storybook/mocks/client-api-instance'
import { StoryFrame } from '@/storybook/story-frame'
import { creditCardCommunity, discussionPost } from './fixtures'
import { OpenPostMenu } from './open-post-menu'

const meta = {
  title: 'Posts/Pin Community Post Menu Item',
  component: PinCommunityPostMenuItem,
  beforeEach() {
    setPinnedPostsFixture()
    return () => clearPinnedPostsFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj

function PinStory({ isPinned }: { isPinned: boolean }) {
  return (
    <StoryFrame width='max-w-sm'>
      <OpenPostMenu>
        <PinCommunityPostMenuItem
          postId={discussionPost.id}
          communitySlug={creditCardCommunity.slug}
          isPinned={isPinned}
        />
      </OpenPostMenu>
    </StoryFrame>
  )
}

export const Unpinned: Story = {
  render: () => <PinStory isPinned={false} />,
}

export const Pinned: Story = {
  render: () => <PinStory isPinned />,
}
