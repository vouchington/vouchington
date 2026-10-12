import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect } from 'storybook/test'
import PostFollowContext from '@/components/posts/post-follow-context'
import { PostRelatedTopicsAside } from '@/components/tags/post-related-topics-aside'
import { PostRelatedPostsAside } from '@/components/tags/post-related-posts-aside'
import { PostRelatedUrlsAside } from '@/components/tags/post-related-urls-aside'
import { PostReviewReferralLinksAside } from '@/components/posts/post-review-referral-links-aside'
import { HnDiscussionsPostAside } from '@/components/asides/hn-discussions-post-aside'
import { PostAsideFixturePreferences } from '@/storybook/mocks/post-detail-asides'
import { StoryFrame } from '@/storybook/story-frame'
import { posts } from '@/storybook/entities/fixtures/posts'
import { topics } from '@/storybook/entities/fixtures/topics'
import { userHref } from '@/lib/links/entity-href'
import { publicUsers, storyCurrentUser } from '@/storybook/entities/fixtures/users'

const discussion = posts.find(post => post.post_type === 'discussion')!
const review = posts.find(post => post.post_type === 'review')!
const referralTopic = topics.find(topic => topic.topic_type === 'referral_program')!
const referralReview = {
  ...review,
  review_topic_ratings: [
    { ...review.review_topic_ratings![0]!, topic: referralTopic, topic_id: referralTopic.id },
  ],
}
const meta = { title: 'Tags/Post Detail Aside Fixtures' } satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

function RelatedContent() {
  return (
    <StoryFrame>
      <PostFollowContext id={discussion.id} />
      <PostRelatedTopicsAside post={discussion} />
      <PostRelatedPostsAside post={discussion} />
      <PostRelatedUrlsAside post={discussion} />
    </StoryFrame>
  )
}

export const AnonymousRelatedContent: Story = {
  parameters: { auth: { currentUser: null } },
  render: () => <RelatedContent />,
  play: async ({ canvasElement }) => {
    await expect(canvasElement).toHaveTextContent(topics[0]!.name)
    await expect(canvasElement).toHaveTextContent(posts[1]!.title)
    await expect(canvasElement.querySelector('a[href="https://example.com/story"]')).not.toBeNull()
    await expect(canvasElement.querySelector('[data-pw="follow-context-card"]')).toBeNull()
    await expect(canvasElement.querySelector(`a[href="${userHref(publicUsers[0]!)}"]`)).toBeNull()
    await expect(canvasElement.querySelector('button')).toBeNull()
  },
}

export const AuthenticatedRelatedContent: Story = {
  parameters: { auth: { currentUser: storyCurrentUser } },
  render: () => <RelatedContent />,
  play: async ({ canvasElement }) => {
    const positiveSection = canvasElement.querySelector('[data-pw="follow-context-card"] section')
    await expect(positiveSection).toHaveTextContent('Positive signals for this post')
    await expect(
      positiveSection?.querySelector(`a[href="${userHref(publicUsers[0]!)}"]`),
    ).toHaveTextContent(publicUsers[0]!.username!)
    await expect(positiveSection?.querySelector('h3 + span')).toHaveTextContent('1')
    await expect(canvasElement).toHaveTextContent(topics[0]!.name)
    await expect(canvasElement.querySelector('button')).not.toBeNull()
  },
}

export const ReviewReferralContent: Story = {
  render: () => (
    <StoryFrame>
      <PostReviewReferralLinksAside post={referralReview} />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('[data-pw="referral-links-aside-heading"]'),
    ).not.toBeNull()
    await expect(
      canvasElement.querySelector('a[href="https://example.com/referral"]'),
    ).not.toBeNull()
  },
}

export const NonReviewHasNoReferral: Story = {
  render: () => (
    <StoryFrame>
      <PostReviewReferralLinksAside post={discussion} />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-pw="referral-links-aside-heading"]')).toBeNull()
  },
}

export const ReviewWithoutProgramHasNoReferral: Story = {
  render: () => (
    <StoryFrame>
      <PostReviewReferralLinksAside post={{ ...review, review_topic_ratings: [] }} />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-pw="referral-links-aside-heading"]')).toBeNull()
  },
}

export const HackerNewsEnabled: Story = {
  parameters: { auth: { currentUser: storyCurrentUser } },
  render: () => (
    <StoryFrame>
      <PostAsideFixturePreferences importHackerNews>
        <HnDiscussionsPostAside post={discussion} />
      </PostAsideFixturePreferences>
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-pw="hn-discussions-title"]')).toHaveTextContent(
      'Show HN: Community discussion',
    )
    await expect(canvasElement.querySelector('[data-pw="hn-discussions-title"]')).toHaveAttribute(
      'href',
      'https://news.ycombinator.com/item?id=424242',
    )
  },
}

export const HackerNewsDisabled: Story = {
  parameters: { auth: { currentUser: storyCurrentUser } },
  render: () => (
    <StoryFrame>
      <PostAsideFixturePreferences importHackerNews={false}>
        <HnDiscussionsPostAside post={discussion} />
      </PostAsideFixturePreferences>
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-pw="hn-discussions-aside"]')).toBeNull()
  },
}

export const HackerNewsWithoutOwnedUrls: Story = {
  parameters: { auth: { currentUser: storyCurrentUser } },
  render: () => (
    <StoryFrame>
      <PostAsideFixturePreferences importHackerNews>
        <HnDiscussionsPostAside
          post={{ ...discussion, id: 'post-story-without-related-urls' }}
          extraUrls={['not-a-url', null]}
        />
      </PostAsideFixturePreferences>
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-pw="hn-discussions-aside"]')).toBeNull()
  },
}
