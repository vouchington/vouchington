import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ListsSidebarGroup } from '../../components/lists/lists-sidebar-group'
import { SidebarProvider } from '@/components/ui/sidebar'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Lists/Lists Sidebar Group',
  component: ListsSidebarGroup,
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/my/lists' },
    },
  },
} satisfies Meta<typeof ListsSidebarGroup>

export default meta
type Story = StoryObj<typeof meta>

export const MyLists: Story = {
  render: () => (
    <StoryFrame width='max-w-xs'>
      <SidebarProvider className='min-h-0'>
        <ListsSidebarGroup />
      </SidebarProvider>
    </StoryFrame>
  ),
}
