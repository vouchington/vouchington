import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { TopicResponseBody } from '@/types/api-responses'
import type { Topic } from '@/types/topics'

const { mockGetTopic, mockNotFound } = vi.hoisted(() => ({
  mockGetTopic: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
const mockManageTagsTabs = vi.hoisted(() => vi.fn<VitestLooseMock>())

// Intentionally minimal: only getTopic is needed by manage-topic-tags.tsx
vi.mock(import('@/lib/api/server'), () => ({ getTopic: mockGetTopic }))
vi.mock(
  import('next/navigation'),
  () => ({ notFound: mockNotFound }) as unknown as typeof import('next/navigation'),
)
vi.mock(
  import('@/components/tags/manage-tags-tabs'),
  () =>
    ({
      ManageTagsTabs: (props: Record<string, unknown>) => {
        mockManageTagsTabs(props)
        return <div data-testid='manage-tags-tabs'>{String(props.entityId)}</div>
      },
    }) as unknown as typeof import('@/components/tags/manage-tags-tabs'),
)

import { ManageTopicTags } from '../manage-topic-tags'

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    __entity_type: 'topic',
    id: 'resolved-uuid',
    topic_type: 'rss_feed',
    name: 'Test Topic',
    slug: 'test-topic',
    markdown: '',
    aliases: [],
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
    ...overrides,
  }
}

function makeTopicResponse(topicOverrides: Partial<Topic> = {}): TopicResponseBody {
  return {
    topic: makeTopic(topicOverrides),
    html: '',
    topic_categories: [],
  }
}

describe('ManageTopicTags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes the resolved UUID (not slug) as entityId to ManageTagsTabs', async () => {
    mockGetTopic.mockResolvedValue(makeTopicResponse({ id: 'resolved-uuid', slug: 'test-topic' }))

    const jsx = await ManageTopicTags({ topicId: 'test-topic', objectType: 'publisher_type' })
    render(jsx)

    expect(screen.getByTestId('manage-tags-tabs').textContent).toBe('resolved-uuid')
  })

  it('passes source topic tag tabs including publisher_type for source topics', async () => {
    mockGetTopic.mockResolvedValue(makeTopicResponse({ topic_type: 'rss_feed' }))

    const jsx = await ManageTopicTags({ topicId: 'test-topic', objectType: 'publisher_type' })
    render(jsx)

    const tabs = mockManageTagsTabs.mock.lastCall?.[0]?.tabs as Array<{ value: string }>
    expect(tabs.map(tab => tab.value)).toContain('publisher_type')
  })

  it('calls notFound for publisher_type on non-source topics', async () => {
    mockGetTopic.mockResolvedValue(makeTopicResponse({ topic_type: 'card' }))

    await expect(
      ManageTopicTags({ topicId: 'test-topic', objectType: 'publisher_type' }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('calls getTopic with the provided topicId (slug or uuid)', async () => {
    mockGetTopic.mockResolvedValue(makeTopicResponse())

    await ManageTopicTags({ topicId: 'test-topic', objectType: 'publisher_type' })

    expect(mockGetTopic).toHaveBeenCalledWith('test-topic')
  })

  it('calls notFound when getTopic returns null', async () => {
    mockGetTopic.mockResolvedValue(null)

    await expect(
      ManageTopicTags({ topicId: 'nonexistent-slug', objectType: 'publisher_type' }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('calls notFound when objectType is not a valid tag segment', async () => {
    mockGetTopic.mockResolvedValue(makeTopicResponse())

    await expect(
      ManageTopicTags({ topicId: 'test-topic', objectType: 'invalid_type' }),
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(mockGetTopic).not.toHaveBeenCalled()
  })
})
