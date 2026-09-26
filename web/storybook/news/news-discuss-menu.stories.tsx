import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { NewsDiscussMenu } from '@/components/news/news-discuss-menu'
import { StoryFrame } from '@/storybook/story-frame'
import { posts } from '@/storybook/entities/fixtures/posts'

const meta = {
  title: 'News/News Discuss Menu',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const SeveralPosts: Story = {
  render: () => (
    <StoryFrame width='max-w-md'>
      <NewsDiscussMenu
        relatedPosts={[posts[0]!, posts[1]!]}
        communityDiscussionUrls={[]}
        itemTitle='Bank launches transfer bonus'
      />
    </StoryFrame>
  ),
}

export const OnePost: Story = {
  render: () => (
    <StoryFrame width='max-w-md'>
      <NewsDiscussMenu
        relatedPosts={[posts[0]!]}
        communityDiscussionUrls={[]}
        itemTitle='Bank launches transfer bonus'
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-md'>
      <NewsDiscussMenu
        relatedPosts={[]}
        communityDiscussionUrls={[]}
      />
    </StoryFrame>
  ),
}
