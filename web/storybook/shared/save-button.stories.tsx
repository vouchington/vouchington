import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SaveButton } from '@/components/shared/save-button'
import { StoryFrame } from '@/storybook/story-frame'
import { posts } from '@/storybook/entities/fixtures/posts'

const story = posts.find(post => post.post_type === 'story')!

const meta = {
  title: 'Shared/Save Button',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Unsaved: Story = {
  render: () => (
    <StoryFrame>
      <SaveButton
        entityType='post'
        entityId={story.id}
        initialActive={false}
      />
    </StoryFrame>
  ),
}

export const Saved: Story = {
  render: () => (
    <StoryFrame>
      <SaveButton
        entityType='post'
        entityId={story.id}
        initialActive
      />
    </StoryFrame>
  ),
}
