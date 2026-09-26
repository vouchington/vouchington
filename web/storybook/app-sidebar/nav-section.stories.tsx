import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AppSidebarNavGroup } from '@/components/app-sidebar/nav-section'
import { Sidebar, SidebarContent, SidebarProvider } from '@/components/ui/sidebar'
import { POSTS_INTENT } from '@/lib/navigation/intents/product-posts'
import { StoryFrame } from '@/storybook/story-frame'

const browseGroup = POSTS_INTENT.groups[0]!

const meta = {
  title: 'App Sidebar/Nav Group',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function NavGroupPreview({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <StoryFrame width='max-w-xs'>
      <SidebarProvider>
        <Sidebar collapsible='none'>
          <SidebarContent>
            <AppSidebarNavGroup
              group={browseGroup}
              pathname='/reviews'
              isAuthenticated={isAuthenticated}
            />
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    </StoryFrame>
  )
}

export const SignedIn: Story = {
  render: () => <NavGroupPreview isAuthenticated />,
}

export const SignedOut: Story = {
  parameters: { auth: { currentUser: null } },
  render: () => <NavGroupPreview isAuthenticated={false} />,
}
