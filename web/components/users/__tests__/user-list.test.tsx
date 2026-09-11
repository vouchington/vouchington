import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UserList } from '../user-list'

describe('UserList', () => {
  it('does not prefix the fallback id with @ when username is missing', async () => {
    render(
      <UserList
        users={[
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
          },
        ]}
        emptyTitle='No users'
        emptyDescription='Nothing to show.'
      />,
    )

    expect(screen.getByText('550e8400-e29b-41d4-a716-446655440000')).toBeDefined()
    expect(screen.queryByText('@550e8400-e29b-41d4-a716-446655440000')).toBeNull()
    expect(screen.queryAllByText('550e8400-e29b-41d4-a716-446655440000')).toHaveLength(1)
  })

  it('does not render an avatar when profile_image_id is absent', async () => {
    render(
      <UserList
        users={[{ id: 'user-1', username: 'alice' }]}
        emptyTitle='No users'
        emptyDescription='Nothing to show.'
      />,
    )
    // No UserAvatar rendered — initials should not appear
    expect(screen.queryByText('AL')).toBeNull()
  })

  it('renders avatar on the right when profile_image_id is set', async () => {
    const { container } = render(
      <UserList
        users={[{ id: 'user-1', username: 'alice', profile_image_id: 'img-xyz' }]}
        emptyTitle='No users'
        emptyDescription='Nothing to show.'
      />,
    )
    // Avatar is rendered — AvatarFallback initials appear in jsdom (image never loads)
    expect(screen.queryByText('AL')).not.toBeNull()
    // Avatar wrapper is the last child of the link (right side)
    const link = container.querySelector('a')
    const children = link ? [...link.children] : []
    expect(children).toHaveLength(2)
    expect(children[1]?.textContent).toBe('AL')
  })

  it('shows mute button for other users when currentUserId is set', async () => {
    render(
      <UserList
        users={[{ id: 'user-other', username: 'bob' }]}
        emptyTitle='No users'
        emptyDescription='Nothing to show.'
        currentUserId='user-viewer'
      />,
    )
    expect(screen.getByRole('button', { name: 'Mute' })).toBeDefined()
  })

  it("does not show mute button for the viewer's own row", async () => {
    render(
      <UserList
        users={[{ id: 'user-viewer', username: 'alice' }]}
        emptyTitle='No users'
        emptyDescription='Nothing to show.'
        currentUserId='user-viewer'
      />,
    )
    expect(screen.queryByRole('button', { name: 'Mute' })).toBeNull()
  })

  it('does not show mute button when currentUserId is absent (unauthenticated)', async () => {
    render(
      <UserList
        users={[{ id: 'user-other', username: 'bob' }]}
        emptyTitle='No users'
        emptyDescription='Nothing to show.'
      />,
    )
    expect(screen.queryByRole('button', { name: 'Mute' })).toBeNull()
  })
})
