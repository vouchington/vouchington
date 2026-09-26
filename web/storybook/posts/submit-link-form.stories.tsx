import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SubmitLinkForm } from '@/components/posts/submit-link-form'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Posts/Submit Link Form',
  component: SubmitLinkForm,
} satisfies Meta

export default meta
type Story = StoryObj

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <SubmitLinkForm />
    </StoryFrame>
  ),
}
