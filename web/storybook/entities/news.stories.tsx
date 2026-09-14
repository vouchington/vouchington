import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { createTranslator } from '@ts-shared/ui-messages'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { CategoryChips } from '@/components/feed/category-chips'
import { NewsItemCard } from '@/components/feed/news-item-card'
import { NewsItemHeader } from '@/components/news/news-item-header'
import { NewsItemList } from '@/components/feed/news-item-list'
import { NewsFilters } from '@/components/news/news-filters'
import { NewsItemActions } from '@/components/news/news-item-actions'
import { NewsItemClusterList } from '@/components/news/news-item-cluster-list'
import { YoutubeRssMetadataRow } from '@/components/news/youtube-rss-metadata-row'
import { EntityStoryFrame, AsideStack, StoryCard, StoryGrid } from './entity-story-frame'
import { newsItems, newsResponse, posts } from './entity-fixtures'

const t = createTranslator('en', await loadJsonMessages('en'))

const newsResponseNoStoryPost = {
  ...newsResponse,
  story_post_ids: {} as Record<string, string>,
  related_posts_by_url_id: {
    [newsItems[0]!.url.id]: [posts[0]!.id],
  },
  posts: { [posts[0]!.id]: posts[0]! },
}

const meta = {
  title: 'Entities/News and RSS Items',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ListPage: Story = {
  render: () => (
    <EntityStoryFrame
      title='News feed'
      aside={NewsAsides}
    >
      <NewsItemList data={newsResponse} />
    </EntityStoryFrame>
  ),
}

export const ClusterListPage: Story = {
  render: () => (
    <EntityStoryFrame title='Clustered news feed (with story-post title link)'>
      <NewsItemClusterList data={newsResponse} />
    </EntityStoryFrame>
  ),
}

export const ClusterListPageNoStoryPost: Story = {
  render: () => (
    <EntityStoryFrame title='Clustered news feed (no story-post)'>
      <NewsItemClusterList data={newsResponseNoStoryPost} />
    </EntityStoryFrame>
  ),
}

export const ClusterListPageLoggedInNoStoryPost: Story = {
  parameters: { auth: { currentUser: { id: 'user-1', username: 'testuser' } } },
  render: () => (
    <EntityStoryFrame title='Clustered news feed (logged in, no story-post — shows Discuss the full story)'>
      <NewsItemClusterList data={newsResponseNoStoryPost} />
    </EntityStoryFrame>
  ),
}

export const ListForm: Story = {
  render: () => (
    <EntityStoryFrame title='News filters'>
      <NewsFilters />
    </EntityStoryFrame>
  ),
}

export const MainPageContent: Story = {
  render: () => (
    <EntityStoryFrame
      title='RSS item'
      aside={NewsAsides}
    >
      <NewsItemCard
        item={newsItems[0]!}
        view='summary'
        footer={modalHref => (
          <NewsItemActions
            item={newsItems[0]!}
            election={newsResponse.rss_feed_item_elections[newsItems[0]!.id]}
            relatedPosts={[posts[0]!]}
            leadingHref={modalHref}
          />
        )}
      />
    </EntityStoryFrame>
  ),
}

export const MediaVariations: Story = {
  render: () => (
    <EntityStoryFrame title='RSS media variations'>
      <StoryGrid>
        {newsItems.map(item => (
          <StoryCard
            key={item.id}
            title={item.rss_feed.feed_type}
          >
            <NewsItemCard
              item={item}
              view='summary'
              footer={() => null}
            />
          </StoryCard>
        ))}
      </StoryGrid>
    </EntityStoryFrame>
  ),
}

export const NewsItemHeaderDefault: Story = {
  render: () => (
    <EntityStoryFrame title='News item header'>
      <NewsItemHeader item={newsItems[0]!} />
    </EntityStoryFrame>
  ),
}

export const YoutubeMetadataRow: Story = {
  render: () => (
    <EntityStoryFrame title='YouTube RSS metadata row'>
      <YoutubeRssMetadataRow
        item={newsItems[2]!}
        t={t}
      />
    </EntityStoryFrame>
  ),
}

export const CategoryChipsMixedOrder: Story = {
  render: () => (
    <EntityStoryFrame title='Category chips — topic-first ordering'>
      <CategoryChips
        tab='news'
        categories={[
          {
            id: null,
            category_text: 'free-alpha',
            topic: null,
            hashtag: null,
            votes_score_net: null,
          },
          {
            id: 'rel-1',
            category_text: 'ignored',
            topic: { id: 'topic-1', name: 'Topic One', slug: 'topic-one', topic_type: 'topic' },
            hashtag: null,
            votes_score_net: 1,
          },
          {
            id: null,
            category_text: 'free-beta',
            topic: null,
            hashtag: null,
            votes_score_net: null,
          },
          {
            id: 'rel-2',
            category_text: 'ignored-2',
            topic: { id: 'topic-2', name: 'Topic Two', slug: 'topic-two', topic_type: 'topic' },
            hashtag: null,
            votes_score_net: 1,
          },
        ]}
      />
    </EntityStoryFrame>
  ),
}

export const Asides: Story = {
  render: () => (
    <EntityStoryFrame title='News asides'>
      <NewsAsides />
    </EntityStoryFrame>
  ),
}

function NewsAsides() {
  return (
    <AsideStack>
      <StoryCard title='Actions'>
        <NewsItemActions
          item={newsItems[0]!}
          election={newsResponse.rss_feed_item_elections[newsItems[0]!.id]}
          relatedPosts={[posts[0]!]}
        />
      </StoryCard>
    </AsideStack>
  )
}
