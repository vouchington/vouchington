import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FeedReferralLinksEmptyState } from '@/components/feed/feed-referral-links-empty-state'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Feed/Feed Referral Links Empty State',
  component: FeedReferralLinksEmptyState,
} satisfies Meta<typeof FeedReferralLinksEmptyState>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {
  args: {
    title: 'No referral links yet',
    description: 'Follow friends to see their referral links.',
    findFriendsLabel: 'Find friends',
    shareYourLinksLabel: 'Share your links',
  },
  render: args => (
    <StoryFrame>
      <FeedReferralLinksEmptyState {...args} />
    </StoryFrame>
  ),
}
