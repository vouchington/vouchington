import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostForm } from '@/components/posts/post-form'
import { StoryFrame } from '@/storybook/story-frame'
import { administrator, communityOptions, discussionCategories, reviewWithBody } from './fixtures'

const meta = {
  title: 'Posts/Post Form',
  component: PostForm,
} satisfies Meta

export default meta
type Story = StoryObj

export const NewDiscussion: Story = {
  render: () => (
    <StoryFrame width='max-w-2xl'>
      <PostForm
        postType='discussion'
        communityOptions={communityOptions}
        initialCommunitySlug={communityOptions[0]?.slug}
        initialDiscussionCategories={discussionCategories}
        initialRelatedUrls={[
          {
            id: 'url-restaurants',
            url: 'https://www.chase.com/personal/credit-cards/sapphire-reserve',
          },
        ]}
      />
    </StoryFrame>
  ),
}

export const EditReview: Story = {
  parameters: { auth: { currentUser: administrator } },
  render: () => (
    <StoryFrame width='max-w-2xl'>
      <PostForm
        postType='review'
        post={reviewWithBody}
        isAdmin
        initialRelatedUrls={[
          {
            id: 'url-sapphire',
            url: 'https://www.chase.com/personal/credit-cards/sapphire-reserve',
          },
        ]}
      />
    </StoryFrame>
  ),
}
