import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PodcastEpisodePlayer } from '@/components/feed/podcast-episode-player'
import { PodcastPlayerProvider } from '@/lib/podcast-player/context'
import type { PodcastEpisode } from '@/lib/podcast-player/types'
import { topicHref } from '@/lib/links/entity-href'
import { newsItems, rssFeeds } from '@/storybook/entities/fixtures/feeds'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Feed/Podcast Episode Player',
  component: PodcastEpisodePlayer,
} satisfies Meta<typeof PodcastEpisodePlayer>

export default meta
type Story = StoryObj<typeof meta>

const show = rssFeeds[1]!
const item = newsItems[1]!

const episode: PodcastEpisode = {
  episodeId: item.id,
  enclosureUrl:
    'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
  enclosureType: 'audio/wav',
  durationSeconds: 1800,
  title: 'Weekly points roundup: Sapphire Reserve changes',
  showId: show.id,
  showTitle: show.title,
  showHref: topicHref(show.topic, 'latest'),
}

export const WeeklyPoints: Story = {
  args: { episode },
  render: args => (
    <StoryFrame>
      <PodcastPlayerProvider>
        <PodcastEpisodePlayer {...args} />
      </PodcastPlayerProvider>
    </StoryFrame>
  ),
}

export const MissingDuration: Story = {
  args: {
    episode: { ...episode, durationSeconds: undefined, title: 'Lounge access office hours' },
  },
  render: args => (
    <StoryFrame>
      <PodcastPlayerProvider>
        <PodcastEpisodePlayer {...args} />
      </PodcastPlayerProvider>
    </StoryFrame>
  ),
}
