import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ImportExportManager } from '@/components/my/import-export/import-export-manager'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'My/Import Export Manager',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Topics: Story = {
  render: () => (
    <StoryFrame>
      <ImportExportManager feedType='topics' />
    </StoryFrame>
  ),
}
