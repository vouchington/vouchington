import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ListImportCommunityDialog } from '@/components/lists/list-import-community-dialog'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Lists/List Import Community Dialog',
  component: ListImportCommunityDialog,
} satisfies Meta<typeof ListImportCommunityDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {
  args: {
    listId: 'list-card-picks',
    open: true,
    onOpenChange: () => {},
  },
  render: args => (
    <StoryFrame>
      <ListImportCommunityDialog {...args} />
    </StoryFrame>
  ),
}
