import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CreateSourceForm } from '@/components/sources/create-source-form'
import { RssFeedListItem } from '@/components/sources/rss-feed-list-item'
import { SourcesFilterForm } from '@/components/topics/sources-filter-form'
import { TopicSourcesAside } from '@/components/topics/topic-sources-aside'
import { EntityStoryFrame, AsideStack, StoryGrid, StoryCard } from './entity-story-frame'
import { hostnamesResponse, rssFeeds, storyCurrentUser } from './entity-fixtures'

const meta = {
  title: 'Entities/Sources',
  parameters: { auth: { currentUser: storyCurrentUser } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ListPage: Story = {
  render: () => (
    <EntityStoryFrame
      title='Sources'
      aside={SourceAsides}
    >
      <div className='space-y-4'>
        {rssFeeds.map(feed => (
          <RssFeedListItem
            key={feed.id}
            feed={feed}
            isFollowing={feed.is_discoverable}
            isFollowingTopic={false}
            hostnameElection={{
              __entity_type: 'hostname_election',
              id: `hostname-election-${feed.id}`,
              votes_score_net: 18,
              votes_count_up: 22,
              votes_count_down: 4,
            }}
            topicElection={{
              id: `topic-election-${feed.id}`,
              votes_score_net: 12,
              votes_count_up: 15,
              votes_count_down: 3,
            }}
          />
        ))}
      </div>
    </EntityStoryFrame>
  ),
}

export const ListForm: Story = {
  render: () => (
    <EntityStoryFrame title='Source filters'>
      <SourcesFilterForm defaultPublisherType='blog' />
    </EntityStoryFrame>
  ),
}

export const ListFormDefault: Story = {
  render: () => (
    <EntityStoryFrame title='Source filters — default'>
      <SourcesFilterForm />
    </EntityStoryFrame>
  ),
}

export const MainPageContent: Story = {
  render: () => (
    <EntityStoryFrame title='Create source'>
      <fieldset disabled>
        <CreateSourceForm />
      </fieldset>
    </EntityStoryFrame>
  ),
}

export const FeedTypeVariations: Story = {
  render: () => (
    <EntityStoryFrame title='Feed type variations'>
      <StoryGrid>
        {rssFeeds.map(feed => (
          <StoryCard
            key={feed.id}
            title={feed.feed_type}
          >
            <RssFeedListItem
              feed={feed}
              isFollowing={feed.is_discoverable}
              isFollowingTopic={false}
            />
          </StoryCard>
        ))}
      </StoryGrid>
    </EntityStoryFrame>
  ),
}

export const Asides: Story = {
  render: () => (
    <EntityStoryFrame title='Source asides'>
      <SourceAsides />
    </EntityStoryFrame>
  ),
}

function SourceAsides() {
  return (
    <AsideStack>
      <TopicSourcesAside
        rssFeeds={{
          results: rssFeeds,
          page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
          topic_elections: {},
          hostname_elections: {},
        }}
        hostnames={hostnamesResponse}
      />
    </AsideStack>
  )
}
