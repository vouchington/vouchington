import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunitiesSidebarGroup } from '../../components/communities/communities-sidebar-group'
import {
  clearMyCommunitiesFixture,
  setMyCommunitiesFixture,
} from '@/storybook/mocks/client-api-instance'
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
  beforeEach() {
    setMyCommunitiesFixture()
    return () => clearMyCommunitiesFixture()
  },
} satisfies Meta<typeof CommunitiesSidebarGroup>

export default meta
type Story = StoryObj<typeof meta>

export const Explore: Story = {
  render: () => (
    <StoryFrame width='max-w-xs'>
      <SidebarProvider className='min-h-0'>
        <CommunitiesSidebarGroup />
      </SidebarProvider>
    </StoryFrame>
  ),
}
