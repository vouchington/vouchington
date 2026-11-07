import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostDetailBody } from '@/components/posts/post-detail-body'
import { PostDetailHeading } from '@/components/posts/post-detail-heading'
import { posts } from '@/storybook/entities/fixtures/posts'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Posts/Post Detail Parts',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const post = posts[0]!

const labels = {
  underReview: 'Under review',
  badges: {
    private: 'Private',
    locked: 'Locked',
    followers: 'Followers',
    signedIn: 'Signed In',
    mutual: 'Mutual',
  },
  ratingAriaLabel: (name: string, rating: number) => `${name}: ${rating} out of 5 stars`,
  dataPoint: {
    creditCard: 'Credit card data point',
    bankAccount: 'Bank account data point',
  },
}

export const Discussion: Story = {
  render: () => (
    <StoryFrame width='max-w-2xl'>
      <PostDetailHeading
        post={post}
        labels={labels}
        isOwner={false}
        isAdmin={false}
        currentUserId={null}
      >
        <p className='text-sm text-muted-foreground'>Posted in a public discussion.</p>
      </PostDetailHeading>
      <PostDetailBody
        post={post}
        html='<p>This fixture includes enough body text to exercise the detail view.</p>'
        labels={labels}
        isOwner={false}
        isAdmin={false}
      />
    </StoryFrame>
  ),
}
