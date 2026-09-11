import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createTranslator } from '@ts-shared/ui-messages'
import enMessages from '@ts-shared/ui-messages/messages/en'
import { TopicRelatedTopicsAsideContent } from '../topic-related-topics-aside-content'
import type { Topic } from '@/types/topics'
import type { EntityRelation } from '@/lib/api/entity-relations'
const { mockManageTagsDialog } = vi.hoisted(() => ({
  mockManageTagsDialog: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('../tag-list'), () => ({
  TagList: ({ relations }: { relations: EntityRelation[] }) => (
    <div data-testid='tag-list'>{relations.length} items</div>
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

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 'topic-1',
    topic_type: 'card',
    name: 'Test Topic',
    slug: 'test-topic',
    referral_program_id: null,
    ...overrides,
  } as Topic
}

describe('TopicRelatedTopicsAsideContent', () => {
  let t: ReturnType<typeof createTranslator>

  beforeAll(async () => {
    t = createTranslator('en', enMessages)
  })

  it('renders Related Topics heading', () => {
    render(
      <TopicRelatedTopicsAsideContent
        topic={makeTopic()}
        relations={[]}
        showManageButton={false}
        t={t}
      />,
    )
    expect(screen.getByText('Related Topics')).toBeDefined()
  })

  it('does not render the manage dialog when showManageButton is false', () => {
    render(
      <TopicRelatedTopicsAsideContent
        topic={makeTopic()}
        relations={[]}
        showManageButton={false}
        t={t}
      />,
    )
    expect(screen.queryByTestId('manage-tags-dialog')).toBeNull()
  })

  it('wires the manage dialog using topic slug for card topic type', () => {
    render(
      <TopicRelatedTopicsAsideContent
        topic={makeTopic({ topic_type: 'card' })}
        relations={[]}
        showManageButton
        t={t}
      />,
    )
    expect(screen.getByTestId('manage-tags-dialog')).toBeDefined()
    expect(mockManageTagsDialog.mock.lastCall?.[0]?.manageHref).toBe('/card/test-topic/tags/topic')
  })

  it('uses topic slug and maps enum to hyphenated type slug for rewards_program', () => {
    render(
      <TopicRelatedTopicsAsideContent
        topic={makeTopic({ id: 'rp-1', topic_type: 'rewards_program' })}
        relations={[]}
        showManageButton
        t={t}
      />,
    )
    expect(mockManageTagsDialog.mock.lastCall?.[0]?.manageHref).toBe(
      '/rewards-program/test-topic/tags/topic',
    )
  })

  it('uses topic slug and maps enum to hyphenated type slug for referral_program', () => {
    render(
      <TopicRelatedTopicsAsideContent
        topic={makeTopic({ id: 'ref-1', topic_type: 'referral_program' })}
        relations={[]}
        showManageButton
        t={t}
      />,
    )
    expect(mockManageTagsDialog.mock.lastCall?.[0]?.manageHref).toBe(
      '/referral-program/test-topic/tags/topic',
    )
  })
})
