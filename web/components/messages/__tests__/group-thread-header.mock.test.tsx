import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock(
  import('@/components/shared/user-avatar'),
  () =>
    ({
      UserAvatar: ({
        username,
      }: {
        username: string
        profileImageId: string | null
        size?: string
      }) => <span data-testid='avatar'>{username}</span>,
    }) as unknown as typeof import('@/components/shared/user-avatar'),
)

import { GroupThreadHeader } from '../group-thread-header'
import type { DirectMessageParticipant } from '@/types/messages'

function makeParticipant(
  id: string,
  userId: string,
  username: string | null = null,
): DirectMessageParticipant {
  return {
    id,
    conversation_id: 'conv-1',
    user_id: userId,
    role: 'member',
    created_at: '2026-01-01T00:00:00Z',
    username,
    profile_image_id: null,
  }
}

describe('GroupThreadHeader', () => {
  it('renders "Conversation" when no other participants', () => {
    render(
      <GroupThreadHeader
        participants={[makeParticipant('p-1', 'u-1', 'me')]}
        currentUserId='u-1'
      />,
    )
    expect(screen.getByText('Conversation')).toBeDefined()
  })

  it('renders participant username labels when others exist', () => {
    const participants = [
      makeParticipant('p-1', 'u-1', 'me'),
      makeParticipant('p-2', 'u-2', 'alice'),
      makeParticipant('p-3', 'u-3', 'bob'),
    ]
    render(
      <GroupThreadHeader
        participants={participants}
        currentUserId='u-1'
      />,
    )
    expect(screen.getByText('@alice, @bob')).toBeDefined()
  })

  it('renders "+N more" suffix when more than 3 others', () => {
    const participants = [
      makeParticipant('p-1', 'u-1', 'me'),
      makeParticipant('p-2', 'u-2', 'alice'),
      makeParticipant('p-3', 'u-3', 'bob'),
      makeParticipant('p-4', 'u-4', 'charlie'),
      makeParticipant('p-5', 'u-5', 'dave'),
    ]
    render(
      <GroupThreadHeader
        participants={participants}
        currentUserId='u-1'
      />,
    )
    expect(screen.getByText('@alice, @bob, @charlie +1 more')).toBeDefined()
  })

  it('filters out current user from displayed avatars', () => {
    const participants = [
      makeParticipant('p-1', 'u-1', 'me'),
      makeParticipant('p-2', 'u-2', 'alice'),
    ]
    render(
      <GroupThreadHeader
        participants={participants}
        currentUserId='u-1'
      />,
    )
    const avatars = screen.getAllByTestId('avatar')
    expect(avatars).toHaveLength(1)
    expect(avatars.at(0)?.textContent).toBe('alice')
  })
})
