import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CategoryChips } from '@/components/feed/category-chips'
import { FeedPageHeader } from '@/components/feed/feed-page-header'
import { FeedSkeleton } from '@/components/feed/feed-skeleton'
import { FeedTopSection } from '@/components/feed/feed-top-section'
import { FeedViewToggle } from '@/components/feed/feed-view-toggle'
import { NewsFilters } from '@/components/news/news-filters'
import { PostFilters } from '@/components/posts/post-filters'
import { PostListTopSection } from '@/components/posts/post-list-top-section'
import { PostViewToggle } from '@/components/posts/post-view-toggle'
import { postRouteConfigs } from '@/lib/route-configs'
import { topics } from '../entities/entity-fixtures'

const meta = {
  title: 'Design System/Feed',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-3xl flex-col gap-4 rounded-md border p-4'>{children}</div>
  </main>
)

export const CategoryChipsDefault: Story = {
  render: () => (
    <Frame>
      <CategoryChips
        categories={[
          { id: null, category_text: 'banking', topic: null, hashtag: null, votes_score_net: null },
          {
            id: 'rel-1',
            category_text: topics[0]!.name,
            topic: topics[0]!,
            hashtag: null,
            votes_score_net: 1.01,
          },
        ]}
      />
    </Frame>
  ),
}

export const FeedHeaderDefault: Story = {
  render: () => (
    <Frame>
      <FeedPageHeader
        category='posts'
        activeFilterPath='/feed/posts'
      />
    </Frame>
  ),
}

export const FeedHeaderReferralLinks: Story = {
  render: () => (
    <Frame>
      <FeedPageHeader
        category='referral-links'
        activeFilterPath='/feed/referral-links'
      />
    </Frame>
  ),
}

export const FeedPostsTopSection: Story = {
  render: () => (
    <Frame>
      <FeedTopSection
        category='posts'
        activeFilterPath='/feed/posts'
        filters={
          <PostFilters
            sortOptions={[
              { label: 'New', value: 'new', description: 'Sort by most recent' },
              { label: 'Hot', value: 'hot', description: 'Sort by trending score' },
            ]}
            defaultSort='new'
            enableRelevanceSort={false}
          />
        }
        viewToggle={<PostViewToggle />}
      />
    </Frame>
  ),
}

export const FeedNewsTopSection: Story = {
  render: () => (
    <Frame>
      <FeedTopSection
        category='news'
        activeFilterPath='/feed/news'
        filters={<NewsFilters />}
        viewToggle={<FeedViewToggle />}
      />
    </Frame>
  ),
}

export const AllPostsTopSection: Story = {
  render: () => (
    <Frame>
      <PostTopSection config={postRouteConfigs.posts} />
    </Frame>
  ),
}

export const StoriesTopSection: Story = {
  render: () => (
    <Frame>
      <PostTopSection config={postRouteConfigs.stories} />
    </Frame>
  ),
}

export const DiscussionsTopSection: Story = {
  render: () => (
    <Frame>
      <PostTopSection config={postRouteConfigs.discussions} />
    </Frame>
  ),
}

export const DataPointsTopSection: Story = {
  render: () => (
    <Frame>
      <PostTopSection config={postRouteConfigs['data-points']} />
    </Frame>
  ),
}

export const ReviewsTopSection: Story = {
  render: () => (
    <Frame>
      <PostTopSection config={postRouteConfigs.reviews} />
    </Frame>
  ),
}

export const FeedSkeletonDefault: Story = {
  render: () => (
    <Frame>
      <FeedSkeleton />
    </Frame>
  ),
}

function PostTopSection({
  config,
}: {
  config: (typeof postRouteConfigs)[keyof typeof postRouteConfigs]
}) {
  return (
    <PostListTopSection
      config={config}
      filters={<PostFilters defaultSort='hot' />}
      viewToggle={<PostViewToggle />}
      isAuthenticated={false}
    />
  )
}
