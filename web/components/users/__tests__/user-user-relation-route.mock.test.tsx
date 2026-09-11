import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { RelationManagementActionConfig } from '../relation-management-action'
import { UserUserRelationRoute } from '../user-user-relation-route'

const {
  mockGetCurrentUser,
  mockGetUserUsersCollection,
  mockGetOwnerRelationAction,
  mockNotFound,
  mockUserList,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetUserUsersCollection: vi.fn<VitestLooseMock>(),
  mockGetOwnerRelationAction: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('notFound')
  }),
  mockUserList: vi.fn<VitestLooseMock>(() => <div>User list</div>),
}))

vi.mock(
  import('next/navigation'),
  () => ({ notFound: mockNotFound }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/server'), () => ({ getUserUsersCollection: mockGetUserUsersCollection }))
vi.mock(import('@/lib/auth/get-current-user'), () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock(import('../user-relation-owner-action'), () => ({
  getOwnerRelationAction: mockGetOwnerRelationAction,
}))
vi.mock(
  import('../user-list'),
  () =>
    ({
      UserList: mockUserList,
    }) as unknown as typeof import('../user-list'),
)

const relationAction: RelationManagementActionConfig = {
  entityType: 'user',
  predicate: 'mute',
  activeLabel: 'extracted.userProfileCollections.usersRssFeeds.muted_2346f214',
  inactiveLabel: 'extracted.userProfileCollections.usersRssFeeds.mute_8dd6857b',
  errorLabel: 'extracted.userProfileCollections.usersRssFeeds.mutedUser_a41ce167',
}

describe('UserUserRelationRoute', () => {
  it('passes resolved data from all three parallel fetches to UserList', async () => {
    mockGetUserUsersCollection.mockResolvedValue({
      results: [{ id: 'user-1' }],
      muted: { 'user-1': true },
    })
    mockGetOwnerRelationAction.mockResolvedValue({ predicate: 'mute' })
    mockGetCurrentUser.mockResolvedValue({ id: 'current-user-1' })

    const result = await UserUserRelationRoute({
      idOrUsername: 'alice',
      listType: 'muted',
      emptyTitle: 'No muted users',
      emptyDescription: 'You have not muted anyone.',
      relationAction,
    })

    render(result)

    expect(mockUserList).toHaveBeenCalledWith(
      expect.objectContaining({
        users: [{ id: 'user-1' }],
        emptyTitle: 'No muted users',
        emptyDescription: 'You have not muted anyone.',
        relationAction: { predicate: 'mute' },
        currentUserId: 'current-user-1',
        muted: { 'user-1': true },
      }),
      undefined,
    )
  })

  it('calls notFound when usersData is null', async () => {
    mockGetUserUsersCollection.mockResolvedValue(null)
    mockGetOwnerRelationAction.mockResolvedValue(null)
    mockGetCurrentUser.mockResolvedValue(null)

    await expect(
      UserUserRelationRoute({
        idOrUsername: 'nonexistent',
        listType: 'muted',
        emptyTitle: 'No muted users',
        emptyDescription: 'You have not muted anyone.',
        relationAction,
      }),
    ).rejects.toThrow('notFound')

    expect(mockNotFound).toHaveBeenCalled()
  })
})
