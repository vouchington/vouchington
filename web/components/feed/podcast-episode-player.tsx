'use client'

import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'
import { formatDuration } from '@ts-shared/utils/format'
import { usePodcastPlayer } from '@/lib/podcast-player/use-podcast-player'
import type { PodcastEpisode } from '@/lib/podcast-player/types'
import { useTranslations } from '@/lib/i18n/use-translations'

export interface PodcastEpisodePlayerProps {
  episode: PodcastEpisode
}

/**
 * Play-trigger for a podcast episode.
 *
 * Calls playEpisode(episode) on click; the actual <audio> element and
 * global playback state live in PodcastPlayerProvider. No audio element here.
 */
export function PodcastEpisodePlayer({ episode }: PodcastEpisodePlayerProps) {
  const t = useTranslations()
  const { playEpisode } = usePodcastPlayer()
  /* c8 ignore next -- icon alias is covered by Vitest; selected browser coverage does not visit podcast playback */
  const ListenIcon = EntityActionIcons.listen

  const handlePlay = useCallback(() => {
    playEpisode(episode)
  }, [playEpisode, episode])

  return (
    <div
      className='rounded-md border bg-muted/30 p-4'
      data-pw='podcast-episode-player'
    >
      <Button
        variant='outline'
        size='sm'
        className='gap-2'
        onClick={handlePlay}
        aria-label={t('extracted.feed.podcastEpisodePlayer.playTitle_64010fec', {
          title: episode.title,
        })}
      >
        <ListenIcon data-icon='inline-start' />
        {t('extracted.feed.podcastEpisodePlayer.playEpisode_b717b4ae')}
      </Button>
      {episode.durationSeconds !== undefined && (
        <p
          className='mt-1 text-xs text-muted-foreground'
          data-pw='podcast-episode-duration'
        >
          {t('extracted.feed.podcastEpisodePlayer.durationDuration_ef1b9c4d', {
            duration: formatDuration(episode.durationSeconds),
          })}
        </p>
      )}
    </div>
  )
}
