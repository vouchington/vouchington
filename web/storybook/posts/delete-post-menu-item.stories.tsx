import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DeletePostMenuItem } from '@/components/posts/delete-post-menu-item'
import { StoryFrame } from '@/storybook/story-frame'
import { reviewPost } from './fixtures'
import { OpenPostMenu } from './open-post-menu'

const meta = {
  title: 'Posts/Delete Post Menu Item',
  component: DeletePostMenuItem,
} satisfies Meta

export default meta
type Story = StoryObj

export const Review: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <OpenPostMenu>
        <DeletePostMenuItem postIdOrSlug={reviewPost.slug ?? reviewPost.id} />
      </OpenPostMenu>
    </StoryFrame>
  ),
}
