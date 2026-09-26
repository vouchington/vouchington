import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SourceFileInput } from '@/components/my/import-export/source-file-input'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'My/Source File Input',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Ready: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <SourceFileInput
        disabled={false}
        onFile={() => {}}
      />
    </StoryFrame>
  ),
}

export const Disabled: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <SourceFileInput
        disabled
        onFile={() => {}}
      />
    </StoryFrame>
  ),
}
