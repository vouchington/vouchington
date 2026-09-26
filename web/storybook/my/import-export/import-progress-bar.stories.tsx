import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ImportProgressBar } from '@/components/my/import-export/import-progress-bar'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'My/Import Progress Bar',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const InProgress: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <ImportProgressBar
        progress={{
          batchId: 'import-topics-september',
          completed: 12,
          failed: 1,
          total: 20,
          done: false,
        }}
      />
    </StoryFrame>
  ),
}

export const Finished: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <ImportProgressBar
        progress={{
          batchId: 'import-topics-september',
          completed: 18,
          failed: 2,
          total: 20,
          done: true,
        }}
      />
    </StoryFrame>
  ),
}
