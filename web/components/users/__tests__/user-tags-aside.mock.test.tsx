import { isValidElement } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EntityRelationsResponse } from '@/lib/api/entity-relations'

const { mockGetEntityRelations, mockGetUserTags, mockManageTagsDialog, mockTagList } = vi.hoisted(
  () => ({
    mockGetEntityRelations: vi.fn<VitestLooseMock>(),
    mockGetUserTags: vi.fn<VitestLooseMock>(),
    mockManageTagsDialog: vi.fn<VitestLooseMock>(),
    mockTagList: vi.fn<VitestLooseMock>(),
  }),
)

vi.mock(import('@/lib/api/server'), () => ({ getEntityRelations: mockGetEntityRelations }))
vi.mock(import('@/lib/api/server/topics'), () => ({ getUserTags: mockGetUserTags }))
vi.mock(
  import('@/components/tags/manage-tags-dialog'),
  () =>
    ({
      ManageTagsDialog: (props: Record<string, unknown>) => {
        mockManageTagsDialog(props)
        return <button type='button'>Manage</button>
      },
    }) as unknown as typeof import('@/components/tags/manage-tags-dialog'),
)
vi.mock(
  import('../user-tags-list'),
  () =>
    ({
      UserTagsList: (props: Record<string, unknown>) => {
        mockTagList(props)
        return <div data-testid='tag-list' />
      },
    }) as unknown as typeof import('../user-tags-list'),
)

import { UserTagsAside } from '../user-tags-aside'

function makeResponse(withRelation = false): EntityRelationsResponse {
  return {
    results: withRelation ? [{ __entity_type: 'entity_relation', id: 'relation-1' }] : [],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    entity_relations: withRelation
      ? {
          'relation-1': {
            id: 'relation-1',
            object_id: 'bot-topic',
            created_at: '2026-07-11T00:00:00.000Z',
            created_by_id: 'moderator-1',
            object_data: { id: 'bot-topic', name: 'Bot' },
          },
        }
      : {},
    election_votes: {},
  }
}

describe('UserTagsAside', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetEntityRelations.mockResolvedValue(makeResponse())
    mockGetUserTags.mockResolvedValue({
      user_tags: [
        { id: 'bot-topic', slug: 'bot', label: 'Bot' },
        { id: 'spammer-topic', slug: 'spammer', label: 'Spammer' },
      ],
    })
  })

  it('loads only positive user tags for the aside', async () => {
    const result = await UserTagsAside({ userId: 'user-2', canManageUserTags: true })

    expect(isValidElement(result)).toBe(true)
    expect(mockGetEntityRelations).toHaveBeenCalledWith('user', 'user-2', 'category', 'topic', {
      searchParams: { positiveNetVoteScore: true, sort: 'best' },
    })
  })

  it('renders an empty state and management trigger when no tags are positive', async () => {
    render(await UserTagsAside({ userId: 'user-2', canManageUserTags: true }))

    expect(screen.getByText('No user tags yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manage' })).toBeInTheDocument()
  })

  it('passes the complete curated catalog to the route-free management dialog', async () => {
    mockGetEntityRelations.mockResolvedValueOnce(makeResponse(true))
    render(await UserTagsAside({ userId: 'user-2', canManageUserTags: true }))

    expect(screen.getByTestId('tag-list')).toBeInTheDocument()
    expect(mockManageTagsDialog.mock.lastCall?.[0]).toMatchObject({
      entityType: 'user',
      entityId: 'user-2',
      predicate: 'category',
      objectType: 'topic',
      enumSelectLabel: 'Select a user tag to add',
      enumOptions: [
        { id: 'bot-topic', slug: 'bot', label: 'Bot' },
        { id: 'spammer-topic', slug: 'spammer', label: 'Spammer' },
      ],
    })
    expect(mockManageTagsDialog.mock.lastCall?.[0]).not.toHaveProperty('manageHref')
  })

  it('does not render controls when the viewer cannot manage user-tag relations', async () => {
    render(await UserTagsAside({ userId: 'user-2', canManageUserTags: false }))

    expect(screen.queryByRole('button', { name: 'Manage' })).not.toBeInTheDocument()
    expect(mockManageTagsDialog).not.toHaveBeenCalled()
  })
})
