// oxlint-disable eslint/max-lines -- entity stories file covers many pod variants plus mini-player
import { useRef } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { createTranslator } from '@ts-shared/ui-messages'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { PodcastShowCard } from '@/components/podcasts/podcast-show-card'
import { PodcastShowMetadataAside } from '@/components/podcasts/podcast-show-metadata-aside'
import { PodcastPlayerProvider } from '@/lib/podcast-player/context'
import { PodcastMiniPlayer } from '@/lib/podcast-player/mini-player'
import type { ViewRssFeed } from '@/types/rss-feeds'
import { EntityStoryFrame } from './entity-story-frame'

const t = createTranslator('en', await loadJsonMessages('en'))

const meta = {
  title: 'Entities/Podcasts',
  parameters: {
    auth: { currentUser: null },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function makePodcastFeed(id: string, overrides?: Partial<ViewRssFeed>): ViewRssFeed {
  return {
    __entity_type: 'rss_feed',
    id,
    title: 'Planet Money',
    is_enabled: true,
    is_discoverable: true,
    etag: null,
    last_modified_at: '2024-01-01T00:00:00Z',
    last_fetched_at: '2024-01-01T00:00:00Z',
    feed_type: 'podcast',
    rss_feed_url: { id: `url-${id}`, url: 'https://feeds.npr.org/510289/podcast.xml' },
    home_page_url: { id: `home-${id}`, url: 'https://npr.org/planetmoney' },
    topic: {
      id: `topic-${id}`,
      name: 'Planet Money',
      slug: 'planet-money',
      topic_type: 'topic',
    },
    podcast_show: {
      itunes_author: 'NPR',
      itunes_owner_name: 'NPR Podcasts',
      cover_art_url: null,
      is_explicit: false,
      itunes_type: 'episodic',
    },
    categories: [
      { category_text: 'business', topic_id: null, topic_slug: null },
      { category_text: 'news', topic_id: null, topic_slug: null },
    ],
    ...overrides,
  } as ViewRssFeed
}

export const ShowCard: Story = {
  render: () => (
    <PodcastPlayerProvider>
      <EntityStoryFrame title='Podcast show card'>
        <div className='space-y-4'>
          <PodcastShowCard feed={makePodcastFeed('feed-1')} />
        </div>
      </EntityStoryFrame>
    </PodcastPlayerProvider>
  ),
}

export const ShowCardWithCoverArt: Story = {
  render: () => (
    <PodcastPlayerProvider>
      <EntityStoryFrame title='Podcast show card — with cover art'>
        <PodcastShowCard
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
        <PodcastShowCard
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
        <PodcastShowCard
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

function MiniPlayerDemo() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  return (
    <div className='relative h-32'>
      <PodcastMiniPlayer
        episode={{
          episodeId: 'story-ep-1',
          enclosureUrl: 'https://feeds.example.com/episode.mp3',
          title: "The real horror of 'Alien: Romulus' – and what makes a great sci-fi horror film",
          showId: 'show-1',
          showTitle: 'Planet Money',
          showHref: '/source/planet-money/latest',
          coverArtUrl: '/sideload/storybook-podcast-mini-player.jpg',
        }}
        onClose={() => {}}
        audioRef={audioRef}
      />
    </div>
  )
}

export const MiniPlayerPlaying: Story = {
  render: () => <MiniPlayerDemo />,
}

export const ShowCardWithVotes: Story = {
  render: () => (
    <PodcastPlayerProvider>
      <EntityStoryFrame title='Podcast list item — with vote controls'>
        <PodcastShowCard
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
              <PodcastShowCard
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
