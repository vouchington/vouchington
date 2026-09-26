import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProfileMenu } from '@/components/navbar/profile-menu'
import { toProfileMenuUser } from '@/lib/auth/client-auth-user'
import { StoryFrame } from '@/storybook/story-frame'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'

const meta = {
  title: 'Navbar/Profile Menu',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Cardholder: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <ProfileMenu
        user={toProfileMenuUser(storyCurrentUser)}
        onLogout={() => {}}
      />
    </StoryFrame>
  ),
}
