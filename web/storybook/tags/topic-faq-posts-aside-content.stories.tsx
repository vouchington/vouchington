import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useTranslations } from '@/lib/i18n/use-translations'
import { TopicFaqPostsAsideContent } from '@/components/tags/topic-faq-posts-aside-content'
import { StoryFrame } from '@/storybook/story-frame'
import { now } from '@/storybook/entities/fixtures/shared'
import { posts } from '@/storybook/entities/fixtures/posts'
import { topics } from '@/storybook/entities/fixtures/topics'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import type { EntityRelation } from '@/lib/api/entity-relations'

const topic = topics[0]!
const article = posts.find(post => post.post_type === 'article')!
const author = publicUsers[0]!

const relations: EntityRelation[] = [
  {
    id: 'relation-transfer-partners',
    object_id: article.id,
    created_at: now,
    created_by_id: author.id,
    votes_count_up: 5,
    votes_count_down: 0,
    object_data: {
      id: article.id,
      title: article.title,
      slug: article.slug,
      post_type: article.post_type,
    },
  },
]

const meta = {
  title: 'Tags/Topic FAQ Posts Aside',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function FaqStory({ empty }: { empty: boolean }) {
  const t = useTranslations()
  return (
    <StoryFrame>
      <TopicFaqPostsAsideContent
        topic={topic}
        relations={empty ? [] : relations}
        showManageButton={!empty}
        isAuthenticated={!empty}
        t={t}
      />
    </StoryFrame>
  )
}

export const WithArticle: Story = {
  render: () => <FaqStory empty={false} />,
}

export const Empty: Story = {
  render: () => <FaqStory empty />,
}
