import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ParticipantsPanel } from '@/components/messages/participants-panel'
import type { DirectMessageParticipant } from '@/types/messages'
import { publicUsers, storyCurrentUser } from '@/storybook/entities/fixtures/users'
import { clearUserSearchFixture, setUserSearchFixture } from '@/storybook/mocks/client-api-instance'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Messages/Participants Panel',
  component: ParticipantsPanel,
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta<typeof ParticipantsPanel>

export default meta
type Story = StoryObj<typeof meta>

const conversationId = 'conversation-card-chat'

const participants: DirectMessageParticipant[] = [
  {
    id: 'participant-me',
    conversation_id: conversationId,
    user_id: storyCurrentUser.id,
    role: 'owner',
    created_at: '2026-05-01T12:00:00.000Z',
    username: storyCurrentUser.username,
    profile_image_id: null,
  },
  {
    id: 'participant-alex',
    conversation_id: conversationId,
    user_id: publicUsers[0]!.id,
    role: 'member',
    created_at: '2026-05-01T12:05:00.000Z',
    username: publicUsers[0]!.username,
    profile_image_id: null,
  },
]

export const Owner: Story = {
  beforeEach() {
    setStoryMutationFixture()
    setUserSearchFixture()
    return () => {
      clearStoryMutationFixture()
      clearUserSearchFixture()
    }
  },
  args: {
    conversationId,
    currentUserId: storyCurrentUser.id,
    isOwner: true,
    initialParticipants: participants,
    initialParticipantAddPolicy: 'owner_only',
  },
  render: args => (
    <StoryFrame width='max-w-md'>
      <ParticipantsPanel {...args} />
    </StoryFrame>
  ),
}

export const Member: Story = {
  args: {
    conversationId,
    currentUserId: publicUsers[0]!.id,
    isOwner: false,
    initialParticipants: participants,
    initialParticipantAddPolicy: 'owner_only',
  },
  render: args => (
    <StoryFrame width='max-w-md'>
      <ParticipantsPanel {...args} />
    </StoryFrame>
  ),
}
