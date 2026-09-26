import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { WriteDialog } from '@/components/navbar/write-dialog'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Navbar/Write Dialog',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {
  render: () => (
    <StoryFrame>
      <WriteDialog
        open
        onOpenChange={() => {}}
      />
    </StoryFrame>
  ),
}
