import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useTranslations } from '@/lib/i18n/use-translations'
import { ManagePostTags } from '@/components/tags/manage-post-tags'
import { StoryFrame } from '@/storybook/story-frame'
import { posts } from '@/storybook/entities/fixtures/posts'

const discussion = posts.find(post => post.post_type === 'discussion')!

const meta = {
  title: 'Tags/Manage Post Tags',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ManagePostTagsStory() {
  const t = useTranslations()
  return (
    <StoryFrame width='max-w-5xl'>
      <ManagePostTags
        t={t}
        postData={{
          post: discussion,
          html: '<p>Best premium card for restaurants, with notes on dining credits and transfer partners.</p>',
        }}
        hideDownCount={false}
        slug='discussion'
        objectType='topic'
      />
    </StoryFrame>
  )
}

export const DiscussionTopics: Story = {
  render: () => <ManagePostTagsStory />,
}
