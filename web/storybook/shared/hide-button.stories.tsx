import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { HideButton } from '@/components/shared/hide-button'
import { StoryFrame } from '@/storybook/story-frame'
import { posts } from '@/storybook/entities/fixtures/posts'

const discussion = posts.find(post => post.post_type === 'discussion')!

const meta = {
  title: 'Shared/Hide Button',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Visible: Story = {
  render: () => (
    <StoryFrame>
      <HideButton
        entityType='post'
        entityId={discussion.id}
        initialActive={false}
      />
    </StoryFrame>
  ),
}

export const Hidden: Story = {
  render: () => (
    <StoryFrame>
      <HideButton
        entityType='post'
        entityId={discussion.id}
        initialActive
      />
    </StoryFrame>
  ),
}
