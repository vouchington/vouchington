import { useRef } from 'react'
import { PodcastMiniPlayer } from '@/lib/podcast-player/mini-player'
import podcastMiniPlayerAudioUrl from './fixtures/podcast-mini-player-silence.wav'

export function MiniPlayerDemo() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  return (
    <div className='relative h-32'>
      <PodcastMiniPlayer
        episode={{
          episodeId: 'story-ep-1',
          enclosureUrl: podcastMiniPlayerAudioUrl,
          enclosureType: 'audio/wav',
          durationSeconds: 3,
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
