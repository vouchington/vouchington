import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostDetailBadges } from '@/components/posts/post-detail-badges'
import { StoryFrame } from '@/storybook/story-frame'
import { badgeLabels, creditCardCommunity, discussionPost, reviewPost } from './fixtures'

const meta = {
  title: 'Posts/Post Detail Badges',
  component: PostDetailBadges,
} satisfies Meta

export default meta
type Story = StoryObj

const reviewTopicIds = new Set(
  (reviewPost.review_topic_ratings ?? []).map(rating => rating.topic_id),
)

export const Review: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PostDetailBadges
        categoryTopics={(reviewPost.post_related_topics ?? []).filter(
          topic => !reviewTopicIds.has(topic.id),
        )}
        postType={reviewPost.post_type}
        broadcast={reviewPost.broadcast}
        privacy={reviewPost.privacy}
        locked={false}
        reviewRatings={(reviewPost.review_topic_ratings ?? []).flatMap(rating =>
          rating.topic
            ? [
                {
                  topicId: rating.topic_id,
                  topic: rating.topic,
                  rating: rating.rating,
                  ariaLabel: `${rating.topic.name}: ${rating.rating} out of 5 stars`,
                },
              ]
            : [],
        )}
        labels={badgeLabels}
      />
    </StoryFrame>
  ),
}

export const PrivateDiscussion: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PostDetailBadges
        categoryTopics={[]}
        postType={discussionPost.post_type}
        broadcast='followers'
        privacy='private'
        locked
        reviewRatings={[]}
        community={creditCardCommunity}
        labels={badgeLabels}
      />
    </StoryFrame>
  ),
}
