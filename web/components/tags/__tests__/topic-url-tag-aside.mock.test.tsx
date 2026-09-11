import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopicUrlTagAside } from '../topic-url-tag-aside'
import type { Topic } from '@/types/topics'
import type { EntityRelation, EntityRelationRef } from '@/lib/api/entity-relations'
const { mockManageTagsDialog } = vi.hoisted(() => ({
  mockManageTagsDialog: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('../tag-list'), () => ({
  TagList: ({ relations, objectType }: { relations: EntityRelation[]; objectType: string }) => (
    <div data-testid='tag-list'>
      {objectType}: {relations.length} items
    </div>
  ),
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

vi.mock(import('@/lib/api/server'), () => ({
  getEntityRelations: vi.fn<VitestLooseMock>().mockResolvedValue({
    results: [],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    entity_relations: {},
    election_votes: {},
  }),
}))

const mockTopic: Topic = {
  __entity_type: 'topic',
  id: 'topic-1',
  name: 'Test Topic',
  slug: 'test-topic',
  markdown: '',
  aliases: [],
  topic_type: 'rss_feed',
  noindex: false,
  allow_reviews: true,
  created_at: '2024-01-01T00:00:00Z',
  hostname_id: null,
  hostname: null,
  logo_image_id: null,
  hero_image_id: null,
  rewards_program_id: null,
  referral_program_id: null,
  referral_program_slug: null,
  created_by: { id: 'user-1', username: 'testuser' } as Topic['created_by'],
  updated_by: { id: 'user-1', username: 'testuser' } as Topic['updated_by'],
}

const mockRef: EntityRelationRef = { __entity_type: 'entity_relation', id: 'rel-1' }

const mockRelation: EntityRelation = {
  id: 'rel-1',
  object_id: 'url-1',
  created_at: '2024-01-01T00:00:00Z',
  created_by_id: 'user-1',
  object_data: { url: 'https://example.com', id: 'url-1' },
}

async function renderAside(
  props: Partial<Parameters<typeof TopicUrlTagAside>[0]> = {},
): Promise<ReturnType<typeof render>> {
  const jsx = await TopicUrlTagAside({
    topic: mockTopic,
    isAuthenticated: true,
    predicate: 'landing_page',
    segment: 'landing_page',
    title: 'Landing Page',
    ...props,
  })
  if (!jsx) return render(<span />)
  return render(jsx)
}

describe('TopicUrlTagAside', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the title as a heading', async () => {
    const { getEntityRelations } = await import('@/lib/api/server')
    vi.mocked(getEntityRelations).mockResolvedValueOnce({
      results: [mockRef],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      entity_relations: { 'rel-1': mockRelation },
      election_votes: {},
    })

    await renderAside()

    expect(screen.getByText('Landing Page')).toBeDefined()
  })

  it('renders TagList with url objectType when relations exist', async () => {
    const { getEntityRelations } = await import('@/lib/api/server')
    vi.mocked(getEntityRelations).mockResolvedValueOnce({
      results: [mockRef],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      entity_relations: { 'rel-1': mockRelation },
      election_votes: {},
    })

    await renderAside()

    expect(screen.getByTestId('tag-list').textContent).toContain('url: 1 items')
  })

  it('renders Manage link when authenticated', async () => {
    const { getEntityRelations } = await import('@/lib/api/server')
    vi.mocked(getEntityRelations).mockResolvedValueOnce({
      results: [mockRef],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      entity_relations: { 'rel-1': mockRelation },
      election_votes: {},
    })

    await renderAside({ isAuthenticated: true })

    expect(screen.getByTestId('manage-tags-dialog')).toBeDefined()
    expect(mockManageTagsDialog.mock.lastCall?.[0]?.manageHref).toBe(
      '/source/test-topic/tags/landing_page',
    )
  })

  it('renders empty state message when no relations and authenticated', async () => {
    await renderAside({ isAuthenticated: true })

    expect(screen.getByText('No landing page set')).toBeDefined()
  })

  it('returns null when no relations and not authenticated', async () => {
    const result = await TopicUrlTagAside({
      topic: mockTopic,
      isAuthenticated: false,
      predicate: 'landing_page',
      segment: 'landing_page',
      title: 'Landing Page',
    })
    expect(result).toBeNull()
  })

  it('does not render the manage dialog when not authenticated', async () => {
    const { getEntityRelations } = await import('@/lib/api/server')
    vi.mocked(getEntityRelations).mockResolvedValueOnce({
      results: [mockRef],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      entity_relations: { 'rel-1': mockRelation },
      election_votes: {},
    })

    await renderAside({ isAuthenticated: false })

    expect(screen.queryByTestId('manage-tags-dialog')).toBeNull()
  })

  it('works for terms_of_service predicate and renders correct title', async () => {
    const { getEntityRelations } = await import('@/lib/api/server')
    vi.mocked(getEntityRelations).mockResolvedValueOnce({
      results: [mockRef],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      entity_relations: { 'rel-1': mockRelation },
      election_votes: {},
    })

    await renderAside({
      predicate: 'terms_of_service',
      segment: 'terms_of_service',
      title: 'Terms of Service',
    })

    expect(screen.getByText('Terms of Service')).toBeDefined()
    expect(mockManageTagsDialog.mock.lastCall?.[0]?.manageHref).toBe(
      '/source/test-topic/tags/terms_of_service',
    )
  })
})
