import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { EditPostPageBody } from '@/components/posts/edit-post-page-body'
import { PostForm } from '@/components/posts/post-form'
import { useTranslations } from '@/lib/i18n/use-translations'
import { StoryFrame } from '@/storybook/story-frame'
import { administrator, reviewWithBody } from './fixtures'

const meta = {
  title: 'Posts/Edit Post Page',
  component: EditPostPageBody,
} satisfies Meta

export default meta
type Story = StoryObj

export const EditReview: Story = {
  parameters: { auth: { currentUser: administrator } },
  render: () => (
    <StoryFrame width='max-w-5xl'>
      <EditPostPageBody
        title='Edit review'
        officialGateMessage={null}
      >
        <PostForm
          postType='review'
          post={reviewWithBody}
          isAdmin
        />
      </EditPostPageBody>
    </StoryFrame>
  ),
}

function OfficialAccountGate() {
  const t = useTranslations()
  return (
    <StoryFrame width='max-w-5xl'>
      <EditPostPageBody
        title='Edit review'
        officialGateMessage={t(
          'extracted.posts.editPostPage.officialAccountsCannotEditCommunityReviews_1a312816',
        )}
      />
    </StoryFrame>
  )
}

export const OfficialAccount: Story = {
  parameters: { auth: { currentUser: administrator } },
  render: () => <OfficialAccountGate />,
}
