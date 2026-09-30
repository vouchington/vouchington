import { describe, vi } from 'vitest'
import type { EntityRelation } from '@/lib/api/entity-relations'
import { registerTopicTagAsideContentTests } from '@/test-helpers/components/tags/topic-tag-aside-content'
import { TopicFaqPostsAsideContent } from '../topic-faq-posts-aside-content'

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

describe('TopicFaqPostsAsideContent', () => {
  registerTopicTagAsideContentTests({
    Component: TopicFaqPostsAsideContent,
    heading: 'FAQ Posts',
    cardManageHref: '/card/test-topic/tags/post',
    rewardsProgramManageHref: '/rewards-program/test-topic/tags/post',
    referralProgramManageHref: '/referral-program/test-topic/tags/post',
    mockManageTagsDialog,
  })
})
