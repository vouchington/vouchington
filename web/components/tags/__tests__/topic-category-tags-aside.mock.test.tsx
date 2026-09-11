import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Topic } from '@/types/topics'
import type { EntityRelation, EntityRelationVote } from '@/lib/api/entity-relations'
const { mockManageTagsDialog } = vi.hoisted(() => ({
  mockManageTagsDialog: vi.fn<VitestLooseMock>(),
}))

const { mockGetEntityRelations, mockTagList } = vi.hoisted(() => ({
  mockGetEntityRelations: vi.fn<VitestLooseMock>(),
  mockTagList: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({ getEntityRelations: mockGetEntityRelations }))
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

import { TopicCategoryTagsAside } from '../topic-category-tags-aside'

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

describe('TopicCategoryTagsAside', () => {
  it('renders for non-source topics (categories are general, not source-gated)', async () => {
    mockGetEntityRelations.mockResolvedValue(emptyResponse)
    // Should still call getEntityRelations for a non-source topic
    await TopicCategoryTagsAside({
      topic: makeTopic({ topic_type: 'card' }),
      isAuthenticated: true,
    })
    expect(mockGetEntityRelations).toHaveBeenCalledWith(
      'topic',
      'topic-uuid-1',
      'category',
      'topic',
      { searchParams: { positiveNetVoteScore: true, sort: 'best' } },
    )
  })

  it('renders nothing when no relations and not authenticated', async () => {
    mockGetEntityRelations.mockResolvedValue(emptyResponse)
    const result = await TopicCategoryTagsAside({ topic: makeTopic(), isAuthenticated: false })
    expect(result).toBeNull()
  })

  it('renders card when authenticated even with no relations', async () => {
    mockGetEntityRelations.mockResolvedValue(emptyResponse)
    const result = await TopicCategoryTagsAside({ topic: makeTopic(), isAuthenticated: true })
    render(result)
    expect(screen.getByText('Categories')).toBeDefined()
    expect(screen.getByText('No categories yet')).toBeDefined()
    expect(screen.getByTestId('manage-tags-dialog')).toBeDefined()
  })

  it('passes topicApiId (UUID) to getEntityRelations, not slug', async () => {
    mockGetEntityRelations.mockResolvedValue(emptyResponse)
    await TopicCategoryTagsAside({
      topic: makeTopic({ id: 'uuid-456', slug: 'my-slug' }),
      isAuthenticated: false,
    })
    expect(mockGetEntityRelations).toHaveBeenCalledWith('topic', 'uuid-456', 'category', 'topic', {
      searchParams: { positiveNetVoteScore: true, sort: 'best' },
    })
  })

  it('passes election_votes from response to TagList', async () => {
    const relation: EntityRelation = {
      id: 'rel-1',
      object_id: 'obj-1',
      created_at: new Date().toISOString(),
      created_by_id: 'user-1',
      object_data: { id: 'obj-1', name: 'Business', topic_type: 'topic', slug: 'business' },
    }
    const electionVotes: Record<string, EntityRelationVote> = { 'rel-1': { choice: 'confirm' } }
    mockGetEntityRelations.mockResolvedValue({
      results: [{ id: 'rel-1' }],
      entity_relations: { 'rel-1': relation },
      election_votes: electionVotes,
    })

    mockTagList.mockClear()
    const result = await TopicCategoryTagsAside({ topic: makeTopic(), isAuthenticated: true })
    render(result)

    expect(mockTagList.mock.lastCall?.[0]?.electionVotes).toEqual(electionVotes)
  })

  it('wires the manage dialog to /tags/category for the topic', async () => {
    mockGetEntityRelations.mockResolvedValue(emptyResponse)
    const result = await TopicCategoryTagsAside({
      topic: makeTopic({ topic_type: 'rss_feed', slug: 'npr', id: 'topic-uuid-1' }),
      isAuthenticated: true,
    })
    render(result)
    expect(screen.getByTestId('manage-tags-dialog')).toBeDefined()
    expect(mockManageTagsDialog.mock.lastCall?.[0]?.manageHref).toBe('/source/npr/tags/category')
  })
})
