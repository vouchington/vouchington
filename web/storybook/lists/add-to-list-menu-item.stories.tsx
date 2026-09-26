import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AddToListMenuItem } from '@/components/lists/add-to-list-menu-item'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { posts } from '@/storybook/entities/fixtures/posts'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Lists/Add To List Menu Item',
  component: AddToListMenuItem,
} satisfies Meta<typeof AddToListMenuItem>

export default meta
type Story = StoryObj<typeof meta>

export const Review: Story = {
  args: { itemType: 'post', entityId: posts[1]!.id },
  render: args => (
    <StoryFrame width='max-w-sm'>
      <DropdownMenu
        defaultOpen
        modal={false}
      >
        <DropdownMenuTrigger>Review actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <AddToListMenuItem {...args} />
        </DropdownMenuContent>
      </DropdownMenu>
    </StoryFrame>
  ),
}
