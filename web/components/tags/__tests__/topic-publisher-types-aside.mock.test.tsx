import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Topic } from '@/types/topics'
import type { EntityRelation, EntityRelationVote } from '@/lib/api/entity-relations'
const { mockManageTagsDialog } = vi.hoisted(() => ({
  mockManageTagsDialog: vi.fn<VitestLooseMock>(),
}))

const { mockGetEntityRelations, mockGetPublisherTypes, mockTagList } = vi.hoisted(() => ({
  mockGetEntityRelations: vi.fn<VitestLooseMock>(),
  mockGetPublisherTypes: vi.fn<VitestLooseMock>(),
  mockTagList: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({ getEntityRelations: mockGetEntityRelations }))
vi.mock(import('@/lib/api/server/topics'), () => ({
  getPublisherTypes: mockGetPublisherTypes,
}))
vi.mock(
  import('../manage-tags-dialog'),
  () =>
    ({
      ManageTagsDialog: (props: Record<string, unknown>) => {
        mockManageTagsDialog(props)
        return <div data-testid='manage-tags-dialog' />
      },
    }) as unknown as typeof import('../manage-tags-dialog'),
)
vi.mock(
  import('../tag-list'),
  () =>
    ({
      TagList: (props: Record<string, unknown>) => {
        mockTagList(props)
        return <div data-testid='tag-list' />
      },
    }) as unknown as typeof import('../tag-list'),
)

import { TopicPublisherTypesAside } from '../topic-publisher-types-aside'

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 'topic-uuid-1',
    topic_type: 'rss_feed',
    name: 'Test Topic',
    slug: 'test-topic',
    referral_program_id: null,
    ...overrides,
  } as Topic
}

const emptyResponse = { results: [], entity_relations: {} }

describe('TopicPublisherTypesAside', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetPublisherTypes.mockResolvedValue({
      publisher_types: [
        { id: 'pt-1', slug: 'blog', label: 'Blog' },
        { id: 'pt-2', slug: 'forum', label: 'Forum' },
      ],
    })
  })

  it('renders nothing for non-source topics without fetching publisher type relations', async () => {
    const result = await TopicPublisherTypesAside({
      topic: makeTopic({ topic_type: 'card' }),
      isAuthenticated: true,
    })

    expect(result).toBeNull()
    expect(mockGetEntityRelations).not.toHaveBeenCalled()
    expect(mockGetPublisherTypes).not.toHaveBeenCalled()
  })

  it('renders nothing when no relations and not authenticated', async () => {
    mockGetEntityRelations.mockResolvedValue(emptyResponse)
    const result = await TopicPublisherTypesAside({ topic: makeTopic(), isAuthenticated: false })
    expect(result).toBeNull()
    expect(mockGetPublisherTypes).not.toHaveBeenCalled()
  })

  it('renders card when authenticated even with no relations', async () => {
    mockGetEntityRelations.mockResolvedValue(emptyResponse)
    const result = await TopicPublisherTypesAside({ topic: makeTopic(), isAuthenticated: true })
    render(result)
    expect(screen.getByText('Publisher Type')).toBeDefined()
    expect(screen.getByText('No publisher type set')).toBeDefined()
    expect(screen.getByTestId('manage-tags-dialog')).toBeDefined()
  })

  it('passes positiveNetVoteScore: true to getEntityRelations for all users', async () => {
    mockGetEntityRelations.mockResolvedValue(emptyResponse)
    await TopicPublisherTypesAside({
      topic: makeTopic({ id: 'uuid-123', slug: 'my-slug' }),
      isAuthenticated: false,
    })
    expect(mockGetEntityRelations).toHaveBeenCalledWith(
      'topic',
      'uuid-123',
      'publisher_type',
      'topic',
      { searchParams: { positiveNetVoteScore: true, sort: 'best' } },
    )
  })

  it('forwards net-positive-score relations to TagList', async () => {
    const relation: EntityRelation = {
      id: 'rel-positive',
      object_id: 'obj-positive',
      created_at: new Date().toISOString(),
      created_by_id: 'user-1',
      object_data: { id: 'obj-positive', name: 'Forum', topic_type: 'topic', slug: 'forum' },
      votes_count_up: 1,
      votes_count_down: 0,
    }
    mockGetEntityRelations.mockResolvedValue({
      results: [{ id: 'rel-positive' }],
      entity_relations: { 'rel-positive': relation },
      election_votes: {},
    })

    mockTagList.mockClear()
    const result = await TopicPublisherTypesAside({ topic: makeTopic(), isAuthenticated: true })
    render(result)

    expect(mockTagList).toHaveBeenCalled()
    expect(mockTagList.mock.lastCall?.[0]?.relations).toEqual([relation])
  })

  it('wires the manage dialog to /tags/publisher_type and forwards publisher types', async () => {
    mockGetEntityRelations.mockResolvedValue(emptyResponse)
    const result = await TopicPublisherTypesAside({
      topic: makeTopic({ topic_type: 'rss_feed', slug: 'npr' }),
      isAuthenticated: true,
    })
    render(result)

    expect(screen.getByTestId('manage-tags-dialog')).toBeDefined()
    expect(mockManageTagsDialog.mock.lastCall?.[0]?.manageHref).toBe(
      '/source/npr/tags/publisher_type',
    )
    expect(Array.isArray(mockManageTagsDialog.mock.lastCall?.[0]?.enumOptions)).toBe(true)
  })

  it('passes election_votes from response to TagList', async () => {
    const relation: EntityRelation = {
      id: 'rel-1',
      object_id: 'obj-1',
      created_at: new Date().toISOString(),
      created_by_id: 'user-1',
      object_data: { id: 'obj-1', name: 'Blog', topic_type: 'topic', slug: 'blog' },
    }
    const electionVotes: Record<string, EntityRelationVote> = { 'rel-1': { choice: 'confirm' } }
    mockGetEntityRelations.mockResolvedValue({
      results: [{ id: 'rel-1' }],
      entity_relations: { 'rel-1': relation },
      election_votes: electionVotes,
    })

    mockTagList.mockClear()
    const result = await TopicPublisherTypesAside({ topic: makeTopic(), isAuthenticated: true })
    render(result)

    expect(mockTagList.mock.lastCall?.[0]?.electionVotes).toEqual(electionVotes)
  })
})
