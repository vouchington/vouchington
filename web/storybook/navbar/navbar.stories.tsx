import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Navbar } from '@/components/navbar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { toProfileMenuUser } from '@/lib/auth/client-auth-user'
import { clearNavbarFixture, setNavbarFixture } from '@/storybook/mocks/navbar-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'

const meta = {
  title: 'Navbar/Navbar',
  beforeEach() {
    setNavbarFixture()
    return () => clearNavbarFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function SignedInNavbar() {
  const [signedOut, setSignedOut] = useState(false)
  return (
    <StoryFrame width='max-w-6xl'>
      <SidebarProvider>
        <Navbar
          onLoggedOut={() => setSignedOut(true)}
          profileMenuUser={signedOut ? null : toProfileMenuUser(storyCurrentUser)}
        />
      </SidebarProvider>
    </StoryFrame>
  )
}

export const SignedIn: Story = {
  render: () => <SignedInNavbar />,
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
