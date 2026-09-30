import { describe, vi } from 'vitest'
import type { EntityRelation } from '@/lib/api/entity-relations'
import { registerTopicTagAsideContentTests } from '@/test-helpers/components/tags/topic-tag-aside-content'
import { TopicRelatedTopicsAsideContent } from '../topic-related-topics-aside-content'

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

describe('TopicRelatedTopicsAsideContent', () => {
  registerTopicTagAsideContentTests({
    Component: TopicRelatedTopicsAsideContent,
    heading: 'Related Topics',
    cardManageHref: '/card/test-topic/tags/topic',
    rewardsProgramManageHref: '/rewards-program/test-topic/tags/topic',
    referralProgramManageHref: '/referral-program/test-topic/tags/topic',
    mockManageTagsDialog,
  })
})
