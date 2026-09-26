import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { userEvent, within } from 'storybook/test'
import { AppealDialog } from '@/components/appeals/appeal-dialog'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Appeals/Appeal Dialog',
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const PostRemoval: Story = {
  render: () => (
    <StoryFrame width='max-w-lg'>
      <AppealDialog
        postId='post-review'
        postRemovalKind='platform'
      />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'File an appeal' }))
  },
}

export const Suspension: Story = {
  render: () => (
    <StoryFrame width='max-w-lg'>
      <AppealDialog suspension />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'File an appeal' }))
  },
}
