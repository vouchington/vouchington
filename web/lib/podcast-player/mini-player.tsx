'use client'

import { useCallback, useState } from 'react'
import { ButtonGroup } from '@/components/ui/button-group'
import { Button } from '@/components/ui/button'
import { ProxiedImage as Image } from '@/components/shared/proxied-image'
import Link from 'next/link'
import { X } from 'lucide-react'
import { TooltipButton } from '@/components/ui/_button-tooltip'
import { podcastEpisodeModalHref } from '@/lib/rss-item-modal'
import type { PodcastEpisode } from './types'
import { formatChapterTime } from './format-chapter-time'
import { useMeasuredHeight } from './use-measured-height'
import { useVisibleChapters } from './use-visible-chapters'
import { useTranslations } from '@/lib/i18n/use-translations'

const PODCAST_PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const

export function PodcastMiniPlayer({
  episode,
  onClose,
  audioRef,
  onHeightChange,
}: {
  episode: PodcastEpisode
  onClose: () => void
  audioRef: React.RefObject<HTMLAudioElement | null>
  onHeightChange?: (height: number) => void
}) {
  const t = useTranslations()
  const episodeModalHref = podcastEpisodeModalHref(episode.episodeId)
  const containerRef = useMeasuredHeight<HTMLDivElement>(onHeightChange)
  const [playbackRate, setPlaybackRate] = useState(1)
  const visibleChapters = useVisibleChapters(episode.episodeId)

  const setAudioPlaybackRate = useCallback(
    (rate: number) => {
      setPlaybackRate(rate)
      const audio = audioRef.current
      if (audio) {
        audio.playbackRate = rate
      }
    },
    [audioRef],
  )

  const seekTo = useCallback(
    (seconds: number) => {
      const audio = audioRef.current
      if (!audio) return
      const duration = Number.isFinite(audio.duration) ? audio.duration : Infinity
      audio.currentTime = Math.min(Math.max(0, seconds), Math.max(0, duration - 1))
    },
    [audioRef],
  )

  return (
    <div
      ref={containerRef}
      className='fixed bottom-0 left-0 right-0 z-50 flex items-center gap-3 border-t bg-background px-4 py-2 shadow-lg'
      data-pw='podcast-mini-player'
    >
      {episode.coverArtUrl ? (
        <Link
          href={episodeModalHref}
          aria-label={t('extracted.podcastPlayer.miniPlayer.openTitle_7944e5ee', {
            title: episode.title,
          })}
          data-pw='podcast-mini-player-cover'
          className='shrink-0'
        >
          <Image
            src={episode.coverArtUrl}
            alt={episode.showTitle ?? episode.title}
            width={40}
            height={40}
            className='rounded object-cover'
          />
        </Link>
      ) : null}
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2 min-w-0'>
          <Link
            href={episodeModalHref}
            aria-label={t('extracted.podcastPlayer.miniPlayer.openTitle_7944e5ee', {
              title: episode.title,
            })}
            className='truncate text-sm font-medium flex-1 min-w-0 hover:underline'
            data-pw='podcast-mini-player-title'
          >
            {episode.title}
          </Link>
          {episode.showTitle ? (
            episode.showHref ? (
              <Link
                href={episode.showHref}
                aria-label={t('extracted.podcastPlayer.miniPlayer.goToShowtitle_68e3e0e6', {
                  showTitle: episode.showTitle,
                })}
                className='shrink-0 max-w-[40%] truncate text-xs text-muted-foreground hover:underline'
                data-pw='podcast-mini-player-show'
              >
                {episode.showTitle}
              </Link>
            ) : (
              <p className='shrink-0 max-w-[40%] truncate text-xs text-muted-foreground'>
                {episode.showTitle}
              </p>
            )
          ) : null}
        </div>
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption */}
        <audio
          ref={audioRef}
          src={episode.enclosureUrl.replace(/^http:\/\//, 'https://')}
          autoPlay
          controls
          aria-label={episode.title}
          className='mt-1 w-full'
          onLoadedMetadata={() => setAudioPlaybackRate(playbackRate)}
        />
        <div className='mt-2 flex flex-col gap-2'>
          <ButtonGroup className='flex-wrap'>
            {PODCAST_PLAYBACK_RATES.map(rate => {
              const isActive = playbackRate === rate
              return (
                <Button
                  key={rate}
                  variant={isActive ? 'default' : 'outline'}
                  size='touchSm'
                  aria-pressed={isActive}
                  aria-label={t(
                    'extracted.podcastPlayer.miniPlayer.setPlaybackSpeedToRateX_2fbc576b',
                    {
                      rate,
                    },
                  )}
                  onClick={() => setAudioPlaybackRate(rate)}
                >
                  {t('extracted.podcastPlayer.miniPlayer.rateX_77f7014e', { rate })}
                </Button>
              )
            })}
          </ButtonGroup>
          {visibleChapters.length > 0 ? (
            <div className='flex items-center gap-2 overflow-x-auto scrollbar-hide'>
              {visibleChapters.map(chapter => {
                return (
                  <Button
                    key={`${chapter.start_seconds}-${chapter.title}`}
                    variant='outline'
                    size='touchSm'
                    className='shrink-0 justify-start'
                    aria-label={t(
                      'extracted.podcastPlayer.miniPlayer.jumpToChaptertitleAtChaptertime_06b21d77',
                      {
                        chapterTitle: chapter.title,
                        chapterTime: formatChapterTime(chapter.start_seconds),
                      },
                    )}
                    title={chapter.title}
                    onClick={() => seekTo(chapter.start_seconds)}
                  >
                    <span className='max-w-56 truncate'>{chapter.title}</span>
                  </Button>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>
      <TooltipButton
        variant='ghost'
        size='icon'
        tooltip={t('extracted.podcastPlayer.miniPlayer.closePlayer_df6a1523')}
        aria-label={t('extracted.podcastPlayer.miniPlayer.closePlayer_df6a1523')}
        className='shrink-0'
        data-pw='podcast-mini-player-close'
        onClick={onClose}
      >
        <X
          className='size-4'
          aria-hidden='true'
        />
      </TooltipButton>
    </div>
  )
}
