import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SubmitSourceButton, SubmitSourceDialog } from '@/components/sources/submit-source-dialog'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Sources/Submit Source Dialog',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Button: Story = {
  render: () => (
    <StoryFrame>
      <SubmitSourceButton />
    </StoryFrame>
  ),
}

export const Open: Story = {
  render: () => (
    <StoryFrame>
      <SubmitSourceDialog
        open
        onOpenChange={() => undefined}
      />
    </StoryFrame>
  ),
}
