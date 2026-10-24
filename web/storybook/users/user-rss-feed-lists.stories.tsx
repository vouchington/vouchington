import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PaginatedUserRssFeedList } from '@/components/users/paginated-user-rss-feed-list'
import { USER_RELATION_ACTIONS } from '@/components/users/user-relation-actions'
import { UserRssFeedItemList } from '@/components/users/user-rss-feed-item-list'
import { newsItems, rssFeeds } from '@/storybook/entities/fixtures/feeds'
import { page_info } from '@/storybook/entities/fixtures/shared'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import type { RssFeedsListResponseBody } from '@/types/api-responses'

const meta = {
  title: 'Users/RSS Feed Lists',
  parameters: { auth: { currentUser: storyCurrentUser } },
  beforeEach() {
    setStoryMutationFixture()
    return () => {
      clearStoryMutationFixture()
    }
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const followedFeed = rssFeeds[0]!

const feedsPage = {
  results: rssFeeds,
  page_info,
  topic_elections: {},
  hostname_elections: {},
  bookmarks: { [followedFeed.id]: { follow: true } },
} as unknown as RssFeedsListResponseBody

export const FollowedFeeds: Story = {
  render: () => (
    <StoryFrame width='max-w-3xl'>
      <PaginatedUserRssFeedList
        initialData={feedsPage}
        endpoint='/api/v1/users/user-alex/rss-feeds'
        emptyTitle='No followed feeds'
        emptyDescription='Feeds you follow will appear here.'
      />
    </StoryFrame>
  ),
}

export const NoFeeds: Story = {
  render: () => (
    <StoryFrame width='max-w-3xl'>
      <PaginatedUserRssFeedList
        initialData={{ ...feedsPage, results: [] }}
        endpoint='/api/v1/users/user-alex/rss-feeds'
        emptyTitle='No followed feeds'
        emptyDescription='Feeds you follow will appear here.'
      />
    </StoryFrame>
  ),
}

export const SavedItems: Story = {
  render: () => (
    <StoryFrame width='max-w-3xl'>
      <UserRssFeedItemList
        items={newsItems.slice(0, 2)}
        emptyTitle='No saved items'
        emptyDescription='Items you save will appear here.'
      />
    </StoryFrame>
  ),
}

export const SavedItemsManaged: Story = {
  render: () => (
    <StoryFrame width='max-w-3xl'>
      <UserRssFeedItemList
        items={newsItems.slice(0, 2)}
        emptyTitle='No saved items'
        emptyDescription='Items you save will appear here.'
        relationAction={USER_RELATION_ACTIONS.rssFeedItem.saved}
      />
    </StoryFrame>
  ),
}

export const NoSavedItems: Story = {
  render: () => (
    <StoryFrame width='max-w-3xl'>
      <UserRssFeedItemList
        items={[]}
        emptyTitle='No saved items'
        emptyDescription='Items you save will appear here.'
      />
    </StoryFrame>
  ),
}
