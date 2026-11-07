import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { createTranslator } from '@ts-shared/ui-messages'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { PodcastListItem } from '@/components/podcasts/podcast-list-item'
import { PodcastShowMetadataAside } from '@/components/podcasts/podcast-show-metadata-aside'
import { PodcastPlayerProvider } from '@/lib/podcast-player/context'
import { EntityStoryFrame } from './entity-story-frame'
import { makePodcastFeed } from './podcasts-story-fixtures'
import { MiniPlayerDemo } from './podcasts-story-mini-player'

const t = createTranslator('en', await loadJsonMessages('en'))

const meta = {
  title: 'Entities/Podcasts',
  parameters: {
    auth: { currentUser: null },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ShowCard: Story = {
  render: () => (
    <PodcastPlayerProvider>
      <EntityStoryFrame title='Podcast show card'>
        <div className='space-y-4'>
          <PodcastListItem feed={makePodcastFeed('feed-1')} />
        </div>
      </EntityStoryFrame>
    </PodcastPlayerProvider>
  ),
}

export const ShowCardWithCoverArt: Story = {
  render: () => (
    <PodcastPlayerProvider>
      <EntityStoryFrame title='Podcast show card — with cover art'>
        <PodcastListItem
          feed={makePodcastFeed('feed-2', {
            title: 'Points Podcast',
            podcast_show: {
              itunes_author: 'The Points Guy',
              itunes_owner_name: null,
              cover_art_url: '/sideload/storybook-podcast-cover.jpg',
              is_explicit: false,
              itunes_type: 'episodic',
            },
          })}
        />
      </EntityStoryFrame>
    </PodcastPlayerProvider>
  ),
}

export const ShowCardExplicit: Story = {
  render: () => (
    <PodcastPlayerProvider>
      <EntityStoryFrame title='Podcast show card — explicit'>
        <PodcastListItem
          feed={makePodcastFeed('feed-3', {
            title: 'True Crime Weekly',
            podcast_show: {
              itunes_author: 'Crime Network',
              itunes_owner_name: null,
              cover_art_url: null,
              is_explicit: true,
              itunes_type: 'serial',
            },
            categories: [
              { category_text: 'true crime', topic_id: null, topic_slug: null },
              { category_text: 'society & culture', topic_id: null, topic_slug: null },
            ],
          })}
        />
      </EntityStoryFrame>
    </PodcastPlayerProvider>
  ),
}

export const ShowCardNoPodcastMetadata: Story = {
  render: () => (
    <PodcastPlayerProvider>
      <EntityStoryFrame title='Podcast show card — no itunes metadata'>
        <PodcastListItem
          feed={makePodcastFeed('feed-4', {
            title: 'Basic Podcast Feed',
            podcast_show: null,
            categories: [],
          })}
        />
      </EntityStoryFrame>
    </PodcastPlayerProvider>
  ),
}

export const ShowMetadataAside: Story = {
  render: () => (
    <PodcastPlayerProvider>
      <EntityStoryFrame title='Podcast show metadata aside (source page sidebar)'>
        <div className='w-64 space-y-4'>
          <PodcastShowMetadataAside
            t={t}
            feed={makePodcastFeed('aside-1')}
          />
          <PodcastShowMetadataAside
            t={t}
            feed={makePodcastFeed('aside-2', {
              podcast_show: {
                itunes_author: 'Crime Network',
                itunes_owner_name: null,
                cover_art_url: null,
                is_explicit: true,
                itunes_type: 'serial',
              },
              categories: [{ category_text: 'true crime', topic_id: null, topic_slug: null }],
            })}
          />
        </div>
      </EntityStoryFrame>
    </PodcastPlayerProvider>
  ),
}

export const MiniPlayerPlaying: Story = {
  render: () => <MiniPlayerDemo />,
}

export const ShowCardWithVotes: Story = {
  render: () => (
    <PodcastPlayerProvider>
      <EntityStoryFrame title='Podcast list item — with vote controls'>
        <PodcastListItem
          feed={makePodcastFeed('vote-1')}
          hostnameElection={{
            __entity_type: 'hostname_election',
            id: 'hostname-election-1',
            votes_score_net: 4,
            votes_count_up: 7,
            votes_count_down: 3,
          }}
          topicElection={{
            id: 'topic-election-1',
            votes_score_net: 12,
            votes_count_up: 15,
            votes_count_down: 3,
          }}
          isFollowing={false}
          isFollowingTopic={false}
        />
      </EntityStoryFrame>
    </PodcastPlayerProvider>
  ),
}

export const HubGrid: Story = {
  render: () => {
    const feeds = [
      makePodcastFeed('grid-1'),
      makePodcastFeed('grid-2', {
        title: 'Tech Talk Daily',
        podcast_show: {
          itunes_author: 'Tech Media',
          itunes_owner_name: null,
          cover_art_url: null,
          is_explicit: false,
          itunes_type: 'episodic',
        },
        categories: [{ category_text: 'technology', topic_id: null, topic_slug: null }],
      }),
      makePodcastFeed('grid-3', {
        title: 'True Crime Weekly',
        podcast_show: {
          itunes_author: 'Crime Network',
          itunes_owner_name: null,
          cover_art_url: null,
          is_explicit: true,
          itunes_type: 'serial',
        },
        categories: [{ category_text: 'true crime', topic_id: null, topic_slug: null }],
      }),
    ]
    return (
      <PodcastPlayerProvider>
        <EntityStoryFrame title='/podcasts hub grid'>
          <div className='space-y-4'>
            {feeds.map(feed => (
              <PodcastListItem
                key={feed.id}
                feed={feed}
              />
            ))}
          </div>
        </EntityStoryFrame>
      </PodcastPlayerProvider>
    )
  },
}
