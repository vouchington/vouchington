import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { UserProfileSkeleton } from '@/components/users/user-profile-skeleton'
import { EntityStoryFrame } from './entity-story-frame'

const meta = {
  title: 'Entities/User Profile Skeleton',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <EntityStoryFrame title='User Profile Skeleton'>
      <UserProfileSkeleton />
    </EntityStoryFrame>
  ),
}
