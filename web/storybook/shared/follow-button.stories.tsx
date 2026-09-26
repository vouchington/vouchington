import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FollowButton } from '../../components/shared/follow-button'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'
import { publicUsers } from '@/storybook/entities/fixtures/users'

const topic = topics[0]!
const member = publicUsers[0]!

const meta = {
  title: 'Shared/Follow Button',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Following: Story = {
  render: () => (
    <StoryFrame>
      <FollowButton
        entityType='topic'
        entityId={topic.id}
        isFollowing
        inactiveLabel='Follow'
        activeLabel='Following'
      />
    </StoryFrame>
  ),
}

export const SignedOut: Story = {
  parameters: { auth: { currentUser: null } },
  render: () => (
    <StoryFrame>
      <FollowButton
        entityType='user'
        entityId={member.id}
        isFollowing={false}
        inactiveLabel='Follow'
        activeLabel='Following'
      />
    </StoryFrame>
  ),
}
