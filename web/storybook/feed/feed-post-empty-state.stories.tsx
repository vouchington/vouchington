import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FeedPostEmptyState } from '@/components/feed/feed-post-empty-state'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Feed/Feed Post Empty State',
  component: FeedPostEmptyState,
} satisfies Meta<typeof FeedPostEmptyState>

export default meta
type Story = StoryObj<typeof meta>

const labels = {
  yourFeedIsEmpty: 'Your feed is empty',
  followTopicsAndPeople: 'Follow topics and people to see their posts.',
  noPostsFromPeople: 'No posts from people you follow',
  followPeople: 'Follow people to see their posts.',
  noPostsYet: 'No posts yet',
  followSomeTopics: 'Follow topics to see posts.',
  browseTopics: 'Browse topics',
  browseFollowedTopics: 'Browse topics',
  findFriends: 'Find friends',
}

export const AllPosts: Story = {
  args: { feedType: 'any', labels },
  render: args => (
    <StoryFrame>
      <FeedPostEmptyState {...args} />
    </StoryFrame>
  ),
}

export const FollowedPeople: Story = {
  args: { feedType: 'follow_users', labels },
  render: args => (
    <StoryFrame>
      <FeedPostEmptyState {...args} />
    </StoryFrame>
  ),
}

export const FollowedTopics: Story = {
  args: { feedType: 'follow_topics', labels },
  render: args => (
    <StoryFrame>
      <FeedPostEmptyState {...args} />
    </StoryFrame>
  ),
}
