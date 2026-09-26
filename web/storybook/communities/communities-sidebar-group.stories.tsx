import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunitiesSidebarGroup } from '../../components/communities/communities-sidebar-group'
import { setMyCommunitiesFixture } from '@/storybook/mocks/client-api-instance'
import { SidebarProvider } from '@/components/ui/sidebar'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Communities Sidebar Group',
  component: CommunitiesSidebarGroup,
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/communities' },
    },
  },
} satisfies Meta<typeof CommunitiesSidebarGroup>

export default meta
type Story = StoryObj<typeof meta>

export const Explore: Story = {
  render: () => {
    setMyCommunitiesFixture()
    return (
      <StoryFrame width='max-w-xs'>
        <SidebarProvider className='min-h-0'>
          <CommunitiesSidebarGroup />
        </SidebarProvider>
      </StoryFrame>
    )
  },
}
