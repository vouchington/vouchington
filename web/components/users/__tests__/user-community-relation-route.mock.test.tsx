import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RelationManagementActionConfig } from '../relation-management-action'
import { UserCommunityRelationRoute } from '../user-community-relation-route'

const { mockGetUserCommunitiesCollection, mockGetOwnerRelationAction, mockNotFound } = vi.hoisted(
  () => ({
    mockGetUserCommunitiesCollection: vi.fn<VitestLooseMock>(),
    mockGetOwnerRelationAction: vi.fn<VitestLooseMock>(),
    mockNotFound: vi.fn<VitestLooseMock>(() => {
      throw new Error('notFound')
    }),
  }),
)

vi.mock(
  import('next/navigation'),
  () => ({ notFound: mockNotFound }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/server'), () => ({
  getUserCommunitiesCollection: mockGetUserCommunitiesCollection,
}))
vi.mock(import('../user-relation-owner-action'), () => ({
  getOwnerRelationAction: mockGetOwnerRelationAction,
}))
vi.mock(
  import('@/components/shared/empty-state'),
  () =>
    ({
      EmptyState: ({ title }: { title: string }) => <div data-testid='empty-state'>{title}</div>,
    }) as unknown as typeof import('@/components/shared/empty-state'),
)
vi.mock(
  import('@/components/communities/community-card'),
  () =>
    ({
      CommunityCard: ({
        community,
        hideJoinButton,
      }: {
        community: { id: string }
        hideJoinButton?: boolean
      }) => (
        <div
          data-testid='community-card'
          data-hide-join-button={String(hideJoinButton ?? false)}
        >
          {community.id}
        </div>
      ),
    }) as unknown as typeof import('@/components/communities/community-card'),
)
vi.mock(import('../relation-management-action'), () => ({
  RelationManagementAction: () => <div data-testid='relation-management-action' />,
}))

const relationAction: RelationManagementActionConfig = {
  entityType: 'community',
  predicate: 'save',
  activeLabel: 'extracted.userProfileCollections.communities.saved_b5c120b3',
  inactiveLabel: 'extracted.userProfileCollections.communities.save_1509f561',
  errorLabel: 'extracted.userProfileCollections.communities.savedCommunity_4fd43d27',
}

describe('UserCommunityRelationRoute', () => {
  it('renders empty state when communitiesData has no results', async () => {
    mockGetUserCommunitiesCollection.mockResolvedValue({ results: [] })
    mockGetOwnerRelationAction.mockResolvedValue(null)

    const result = await UserCommunityRelationRoute({
      idOrUsername: 'alice',
      listType: 'saved',
      relationAction,
    })

    render(result as React.ReactElement)
    expect(screen.getByTestId('empty-state')).toBeDefined()
    expect(screen.queryByTestId('community-card')).toBeNull()
  })

  it('renders community cards when communitiesData has results', async () => {
    mockGetUserCommunitiesCollection.mockResolvedValue({
      results: [{ id: 'community-1' }],
    })
    mockGetOwnerRelationAction.mockResolvedValue(null)

    const result = await UserCommunityRelationRoute({
      idOrUsername: 'alice',
      listType: 'saved',
      relationAction,
    })

    render(result as React.ReactElement)
    expect(screen.getByTestId('community-card')).toHaveTextContent('community-1')
    expect(screen.queryByTestId('empty-state')).toBeNull()
  })

  it('renders CommunityCard with hideJoinButton to suppress join control', async () => {
    mockGetUserCommunitiesCollection.mockResolvedValue({
      results: [{ id: 'community-1' }],
    })
    mockGetOwnerRelationAction.mockResolvedValue(null)

    const result = await UserCommunityRelationRoute({
      idOrUsername: 'alice',
      listType: 'saved',
      relationAction,
    })

    render(result as React.ReactElement)
    const card = screen.getByTestId('community-card')
    expect(card).toHaveAttribute('data-hide-join-button', 'true')
  })
})
