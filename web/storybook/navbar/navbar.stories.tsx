import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Navbar } from '@/components/navbar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { toProfileMenuUser } from '@/lib/auth/client-auth-user'
import { StoryFrame } from '@/storybook/story-frame'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'

const meta = {
  title: 'Navbar/Navbar',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const SignedIn: Story = {
  render: () => (
    <StoryFrame width='max-w-6xl'>
      <SidebarProvider>
        <Navbar profileMenuUser={toProfileMenuUser(storyCurrentUser)} />
      </SidebarProvider>
    </StoryFrame>
  ),
}

export const SignedOut: Story = {
  parameters: { auth: { currentUser: null } },
  render: () => (
    <StoryFrame width='max-w-6xl'>
      <SidebarProvider>
        <Navbar profileMenuUser={null} />
      </SidebarProvider>
    </StoryFrame>
  ),
}
