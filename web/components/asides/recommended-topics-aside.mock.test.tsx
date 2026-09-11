import type { ReactElement } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { RecommendedTopicsResponseBody } from '@/types/api-responses'

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getRecommendedTopics: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/asides/recommended-topics-aside-content'), () => ({
  RecommendedTopicsAsideContent: ({ topics }: { topics: { id: string; name: string }[] }) => (
    <div data-testid='recommended-topics-aside-content'>
      {topics.map(t => (
        <span key={t.id}>{t.name}</span>
      ))}
    </div>
  ),
}))

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getRecommendedTopics } from '@/lib/api/server'
import { RecommendedTopicsAside } from './recommended-topics-aside'

const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockGetRecommendedTopics = vi.mocked(getRecommendedTopics)

const mockData = {
  results: [{ __entity_type: 'topic', id: 'topic-1', score: 0.9, reason: 'trending' }],
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  topics: { 'topic-1': { id: 'topic-1', name: 'Visa Platinum', slug: 'visa-platinum' } },
  topics_metrics: {},
} as unknown as RecommendedTopicsResponseBody

const emptyData = {
  results: [],
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  topics: {},
  topics_metrics: {},
} as unknown as RecommendedTopicsResponseBody

describe('RecommendedTopicsAside', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    const result = await RecommendedTopicsAside()
    const { container } = render(result as ReactElement)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when results are empty', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'u1', roles: [], username: 'alice' })
    mockGetRecommendedTopics.mockResolvedValue(emptyData)
    const result = await RecommendedTopicsAside()
    const { container } = render(result as ReactElement)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders content when authenticated and results exist', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'u1', roles: [], username: 'alice' })
    mockGetRecommendedTopics.mockResolvedValue(mockData)
    const result = await RecommendedTopicsAside()
    render(result as ReactElement)
    expect(screen.getByTestId('recommended-topics-aside-content')).toBeDefined()
    expect(screen.getByText('Visa Platinum')).toBeDefined()
  })

  it('excludes blocked topics server-side and shows eligible ones', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'u1', roles: [], username: 'alice' })
    mockGetRecommendedTopics.mockResolvedValue({
      results: [
        { __entity_type: 'topic', id: 'topic-1', score: 0.9, reason: 'algo' },
        { __entity_type: 'topic', id: 'topic-2', score: 0.8, reason: 'algo' },
      ],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      topics: {
        'topic-1': { id: 'topic-1', name: 'Blocked Topic', slug: 'blocked-topic' },
        'topic-2': { id: 'topic-2', name: 'Chase Sapphire', slug: 'chase-sapphire' },
      },
      topics_metrics: {},
      bookmarks: { 'topic-1': { block: true } },
    } as unknown as RecommendedTopicsResponseBody)
    const result = await RecommendedTopicsAside()
    render(result as ReactElement)
    expect(screen.queryByText('Blocked Topic')).toBeNull()
    expect(screen.getByText('Chase Sapphire')).toBeDefined()
  })

  it('excludes followed and dismissed topics server-side', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'u1', roles: [], username: 'alice' })
    mockGetRecommendedTopics.mockResolvedValue({
      results: [
        { __entity_type: 'topic', id: 'topic-1', score: 0.9, reason: 'algo' },
        { __entity_type: 'topic', id: 'topic-2', score: 0.8, reason: 'algo' },
        { __entity_type: 'topic', id: 'topic-3', score: 0.7, reason: 'algo' },
      ],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      topics: {
        'topic-1': { id: 'topic-1', name: 'Already Followed', slug: 'already-followed' },
        'topic-2': { id: 'topic-2', name: 'Already Dismissed', slug: 'already-dismissed' },
        'topic-3': { id: 'topic-3', name: 'Actionable Topic', slug: 'actionable-topic' },
      },
      topics_metrics: {},
      bookmarks: {
        'topic-1': { follow: true },
        'topic-2': { dismiss_recommendation: true },
      },
    } as unknown as RecommendedTopicsResponseBody)
    const result = await RecommendedTopicsAside()
    render(result as ReactElement)
    expect(screen.queryByText('Already Followed')).toBeNull()
    expect(screen.queryByText('Already Dismissed')).toBeNull()
    expect(screen.getByText('Actionable Topic')).toBeDefined()
  })

  it('renders nothing when topics record has no matching entries', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'u1', roles: [], username: 'alice' })
    mockGetRecommendedTopics.mockResolvedValue({
      ...emptyData,
      results: [{ __entity_type: 'topic', id: 'topic-orphan', score: 0.5, reason: 'algo' }],
    } as unknown as RecommendedTopicsResponseBody)
    const result = await RecommendedTopicsAside()
    const { container } = render(result as ReactElement)
    expect(container).toBeEmptyDOMElement()
  })
})
