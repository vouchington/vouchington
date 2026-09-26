import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { AddSourceButton } from '@/components/sources/add-source-button'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Sources/Add Source Button',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const News: Story = {
  render: () => (
    <StoryFrame>
      <AddSourceButton kind='news' />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Add News Source' }))
    await expect(
      await within(document.body).findByRole('dialog', { name: 'Add a news source' }),
    ).toBeVisible()
  },
}

export const Podcast: Story = {
  render: () => (
    <StoryFrame>
      <AddSourceButton kind='podcast' />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Add Podcast' }))
    await expect(
      await within(document.body).findByRole('dialog', { name: 'Add a podcast' }),
    ).toBeVisible()
  },
}
