import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { ContentUnavailableNotice } from '@/components/moderation/notices/content-unavailable-notice'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Moderation/Content Unavailable Notice',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <StoryFrame>
      <ContentUnavailableNotice />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toBeVisible()
  },
}
