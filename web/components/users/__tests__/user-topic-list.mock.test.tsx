import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock(import('@/components/topics/topic-card'), () => ({
  TopicCard: ({
    topic,
    hideBookmarkActions,
  }: {
    topic: { id: string; name: string }
    hideBookmarkActions?: boolean
  }) => (
    <div
      data-testid={`topic-card-${topic.id}`}
      data-hide-bookmark-actions={String(Boolean(hideBookmarkActions))}
    />
  ),
}))

vi.mock(
  import('@/components/shared/empty-state'),
  () =>
    ({
      EmptyState: ({ title }: { title: string }) => <div data-testid='empty-state'>{title}</div>,
    }) as unknown as typeof import('@/components/shared/empty-state'),
)

vi.mock(import('../relation-management-action'), () => ({
  RelationManagementAction: ({ entityId }: { entityId: string }) => (
    <button
      type='button'
      data-testid={`relation-action-${entityId}`}
    >
      Action
    </button>
  ),
}))

import { UserTopicList } from '../user-topic-list'
import type { Topic } from '@/types/topics'
import type { RelationManagementActionConfig } from '../relation-management-action'

function makeTopic(overrides?: Partial<Topic>): Topic {
  return {
    __entity_type: 'topic',
    id: 'topic-1',
    name: 'Test Topic',
    slug: 'test-topic',
    markdown: '',
    aliases: [],
    topic_type: 'card',
    noindex: false,
    allow_reviews: true,
    created_at: '2024-01-01T00:00:00Z',
    logo_image_id: null,
    hero_image_id: null,
    rewards_program_id: null,
    referral_program_id: null,
    created_by: { id: 'user-1', display_name: 'Test', display_name_url_id: 'test' },
    updated_by: { id: 'user-1', display_name: 'Test', display_name_url_id: 'test' },
    ...overrides,
  }
}

const muteConfig: RelationManagementActionConfig = {
  entityType: 'topic',
  predicate: 'mute',
  activeLabel: 'extracted.userProfileCollections.postsTopics.muted_2346f214',
  inactiveLabel: 'extracted.userProfileCollections.postsTopics.mute_8dd6857b',
  errorLabel: 'extracted.userProfileCollections.postsTopics.mutedTopic_62b92773',
}

describe('UserTopicList', () => {
  it('renders empty state when topics array is empty', () => {
    render(
      <UserTopicList
        topics={[]}
        emptyTitle='No topics'
        emptyDescription='Nothing here.'
      />,
    )
    expect(screen.getByTestId('empty-state')).toBeDefined()
    expect(screen.getByText('No topics')).toBeDefined()
  })

  it('renders a TopicCard for each topic without relationAction', () => {
    const topics = [makeTopic({ id: 't-1', name: 'Alpha' }), makeTopic({ id: 't-2', name: 'Beta' })]
    render(
      <UserTopicList
        topics={topics}
        emptyTitle='No topics'
        emptyDescription='Nothing here.'
      />,
    )
    expect(screen.getByTestId('topic-card-t-1')).toBeDefined()
    expect(screen.getByTestId('topic-card-t-2')).toBeDefined()
    expect(screen.queryByTestId('empty-state')).toBeNull()
  })

  it('passes hideBookmarkActions=true to TopicCard when relationAction is provided', () => {
    const topics = [makeTopic({ id: 't-1' })]
    render(
      <UserTopicList
        topics={topics}
        emptyTitle='No topics'
        emptyDescription='Nothing here.'
        relationAction={muteConfig}
      />,
    )
    const card = screen.getByTestId('topic-card-t-1')
    expect(card.getAttribute('data-hide-bookmark-actions')).toBe('true')
  })

  it('passes hideBookmarkActions=false to TopicCard when no relationAction', () => {
    const topics = [makeTopic({ id: 't-1' })]
    render(
      <UserTopicList
        topics={topics}
        emptyTitle='No topics'
        emptyDescription='Nothing here.'
      />,
    )
    const card = screen.getByTestId('topic-card-t-1')
    expect(card.getAttribute('data-hide-bookmark-actions')).toBe('false')
  })

  it('renders RelationManagementAction for each topic when relationAction is set', () => {
    const topics = [makeTopic({ id: 't-1' }), makeTopic({ id: 't-2' })]
    render(
      <UserTopicList
        topics={topics}
        emptyTitle='No topics'
        emptyDescription='Nothing here.'
        relationAction={muteConfig}
      />,
    )
    expect(screen.getByTestId('relation-action-t-1')).toBeDefined()
    expect(screen.getByTestId('relation-action-t-2')).toBeDefined()
  })

  it('does not render RelationManagementAction when no relationAction', () => {
    const topics = [makeTopic({ id: 't-1' })]
    render(
      <UserTopicList
        topics={topics}
        emptyTitle='No topics'
        emptyDescription='Nothing here.'
      />,
    )
    expect(screen.queryByTestId('relation-action-t-1')).toBeNull()
  })
})
