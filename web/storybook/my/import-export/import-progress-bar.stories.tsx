import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

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
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement)
    const bar = canvas.getByRole('progressbar', { name: 'Processing… 13 / 20' })
    await expect(bar).toHaveAttribute('aria-valuenow', '65')
    await expect(bar).toHaveAttribute('data-pw', 'progress')
  },
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
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement)
    const bar = canvas.getByRole('progressbar', { name: 'Done — 18 imported, 2 failed' })
    await expect(bar).toHaveAttribute('aria-valuenow', '100')
    await expect(bar).toHaveAttribute('data-pw', 'progress')
  },
}
