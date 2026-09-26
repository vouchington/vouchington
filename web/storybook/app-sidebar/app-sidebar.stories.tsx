import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { StoryFrame } from '@/storybook/story-frame'

const reviewsNavigation = {
  nextjs: { navigation: { pathname: '/reviews' } },
}

const meta = {
  title: 'App Sidebar/App Sidebar',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function SidebarPreview() {
  return (
    <StoryFrame width='max-w-xs'>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </StoryFrame>
  )
}

export const SignedIn: Story = {
  parameters: reviewsNavigation,
  render: () => <SidebarPreview />,
}

export const SignedOut: Story = {
  parameters: { ...reviewsNavigation, auth: { currentUser: null } },
  render: () => <SidebarPreview />,
}
