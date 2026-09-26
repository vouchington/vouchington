import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { GroupThreadHeader } from '@/components/messages/group-thread-header'
import type { DirectMessageParticipant } from '@/types/messages'
import { publicUsers, storyCurrentUser } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Messages/Group Thread Header',
  component: GroupThreadHeader,
} satisfies Meta<typeof GroupThreadHeader>

export default meta
type Story = StoryObj<typeof meta>

const conversationId = 'conversation-card-chat'

function participant(
  id: string,
  userId: string,
  username: string | undefined,
  role: DirectMessageParticipant['role'],
): DirectMessageParticipant {
  return {
    id,
    conversation_id: conversationId,
    user_id: userId,
    role,
    created_at: '2026-05-01T12:00:00.000Z',
    username: username ?? null,
    profile_image_id: null,
  }
}

const participants = [
  participant('participant-me', storyCurrentUser.id, storyCurrentUser.username, 'owner'),
  participant('participant-alex', publicUsers[0]!.id, publicUsers[0]!.username, 'member'),
  participant('participant-new', publicUsers[2]!.id, publicUsers[2]!.username, 'member'),
]

export const CardChat: Story = {
  args: { participants, currentUserId: storyCurrentUser.id },
  render: args => (
    <StoryFrame>
      <GroupThreadHeader {...args} />
    </StoryFrame>
  ),
}
