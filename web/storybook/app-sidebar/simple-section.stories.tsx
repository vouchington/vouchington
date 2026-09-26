import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CreditCard, MessageSquare, Star } from 'lucide-react'
import { SimpleSidebarSection } from '@/components/app-sidebar/simple-section'
import { Sidebar, SidebarContent, SidebarProvider } from '@/components/ui/sidebar'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'App Sidebar/Simple Section',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Reviews: Story = {
  render: () => (
    <StoryFrame width='max-w-xs'>
      <SidebarProvider>
        <Sidebar collapsible='none'>
          <SidebarContent>
            <SimpleSidebarSection
              dataPw='sidebar-group-cards'
              label='Cards'
              items={[
                {
                  href: '/reviews',
                  icon: Star,
                  label: 'Sapphire Reserve reviews',
                  dataPw: 'sidebar-nav-reviews',
                  active: true,
                },
                {
                  href: '/data-points',
                  icon: CreditCard,
                  label: 'Application data points',
                  dataPw: 'sidebar-nav-data-points',
                },
                {
                  href: '/discussions',
                  icon: MessageSquare,
                  label: 'Card discussions',
                  dataPw: 'sidebar-nav-discussions',
                },
              ]}
            />
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-xs'>
      <SidebarProvider>
        <Sidebar collapsible='none'>
          <SidebarContent>
            <SimpleSidebarSection
              dataPw='sidebar-group-cards'
              label='Cards'
              items={[]}
            />
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    </StoryFrame>
  ),
}
