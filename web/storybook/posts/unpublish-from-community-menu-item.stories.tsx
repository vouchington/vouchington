import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { UnpublishFromCommunityMenuItem } from '@/components/posts/unpublish-from-community-menu-item'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import { creditCardCommunity, discussionPost } from './fixtures'
import { OpenPostMenu } from './open-post-menu'

const meta = {
  title: 'Posts/Unpublish From Community Menu Item',
  component: UnpublishFromCommunityMenuItem,
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj

export const CreditCardsDiscussion: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <OpenPostMenu>
        <UnpublishFromCommunityMenuItem
          communityId={creditCardCommunity.id}
          postId={discussionPost.id}
        />
      </OpenPostMenu>
    </StoryFrame>
  ),
}
