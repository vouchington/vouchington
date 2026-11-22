import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FollowContextCard } from '@/components/social/follow-context-card'
import { TopicFollowerSection } from '@/components/topics/topic-follower-section'
import type { PublicUser } from '@/types/user'

const previewUsers: PublicUser[] = ['alex', 'ines', 'lucia', 'mira', 'vera'].map(username => ({
  id: username,
  username,
  account_type: null,
}))

const meta = {
  title: 'Topics/Topic Follow Context',
  component: TopicFollowerSection,
  args: {
    topicId: 'weekend-trips',
    title: 'Follow this topic',
  },
  render: args => (
    <FollowContextCard
      title='From people you follow'
      sections={[]}
      extraSection={<TopicFollowerSection {...args} />}
    />
  ),
} satisfies Meta<typeof TopicFollowerSection>

export default meta
type Story = StoryObj<typeof meta>

export const ExactFollowingCount: Story = {
  args: { initialPage: { total: 7, users: previewUsers, next_cursor: null } },
  render: ({ title, initialPage }) => (
    <FollowContextCard
      title='From people you follow'
      sections={[
        {
          title,
          data: initialPage,
          emptyLabel: 'No followed users follow this topic.',
        },
      ]}
    />
  ),
}

export const CappedFollowingCount: Story = {
  args: { initialPage: { total: 99, users: previewUsers, next_cursor: 'opaque-story-cursor' } },
}

export const IncompleteEmptyPreview: Story = {
  args: { initialPage: { total: 0, users: [], next_cursor: 'opaque-story-cursor' } },
}
