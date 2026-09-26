import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AppealForm } from '@/components/appeals/appeal-form'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Appeals/Appeal Form',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const PostRemoval: Story = {
  render: () => (
    <StoryFrame width='max-w-lg'>
      <AppealForm
        targetType='removal'
        targetId='post-review'
        postRemovalKind='platform'
        onSuccess={() => {}}
      />
    </StoryFrame>
  ),
}

export const Suspension: Story = {
  render: () => (
    <StoryFrame width='max-w-lg'>
      <AppealForm
        targetType='suspension'
        onSuccess={() => {}}
      />
    </StoryFrame>
  ),
}
