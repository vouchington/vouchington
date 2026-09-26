import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ManageCategoriesMenuItem } from '@/components/feed/manage-categories-menu-item'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { newsItems } from '@/storybook/entities/fixtures/feeds'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Feed/Manage Categories Menu Item',
  component: ManageCategoriesMenuItem,
} satisfies Meta<typeof ManageCategoriesMenuItem>

export default meta
type Story = StoryObj<typeof meta>

export const PointsPodcast: Story = {
  args: { entityId: newsItems[1]!.id },
  render: args => (
    <StoryFrame width='max-w-sm'>
      <DropdownMenu
        defaultOpen
        modal={false}
      >
        <DropdownMenuTrigger>Feed item actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <ManageCategoriesMenuItem {...args} />
        </DropdownMenuContent>
      </DropdownMenu>
    </StoryFrame>
  ),
}
