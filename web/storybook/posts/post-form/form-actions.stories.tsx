import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FormActions } from '@/components/posts/post-form/form-actions'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Posts/Form Actions',
  component: FormActions,
} satisfies Meta

export default meta
type Story = StoryObj

export const ReadyToPost: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <FormActions
        isEdit={false}
        isSubmitting={false}
        disabled={false}
        onCancel={() => {}}
      />
    </StoryFrame>
  ),
}

export const SaveBlocked: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <FormActions
        isEdit
        isSubmitting={false}
        disabled
        onCancel={() => {}}
      />
    </StoryFrame>
  ),
}
