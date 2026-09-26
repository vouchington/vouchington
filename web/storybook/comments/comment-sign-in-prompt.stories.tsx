import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommentSignInPrompt } from '@/components/comments/comment-sign-in-prompt'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Comments/Comment Sign In Prompt',
  parameters: {
    auth: { currentUser: null },
    nextjs: { navigation: { pathname: '/review/post-review' } },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const OnReview: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <CommentSignInPrompt />
    </StoryFrame>
  ),
}
