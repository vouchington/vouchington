'use client'

import Link from 'next/link'
import { ProxiedImage as Image } from '@/components/shared/proxied-image'
import { CardContent } from '@/components/ui/card'
import { YoutubeRssMetadataRow } from '@/components/news/youtube-rss-metadata-row'
import type { RssFeedItem } from '@/types/rss-feed-items'
import type { FeedStyle } from '@/lib/preferences/shared'
import type { UrlEmbed } from '@/types/api-responses/posts-topics-and-feeds'
import { selectAuthorizedPlayerUrl, type EmbedAudio } from '@/lib/embeds/embed-preview'
import { topicHref } from '@/lib/links/entity-href'
import { getContentLanguageDir } from '@ts-shared/languages/content-languages'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { useTranslations } from '@/lib/i18n/use-translations'
import { PodcastEpisodePlayer } from './podcast-episode-player'
import { VideoEmbed } from './video-embed'

export function NewsItemCardMedia({
  item,
  view,
  embed,
  audio,
  previewTitle,
  excerpt,
  fallbackExcerpt,
  videoPlatform,
  renderedThumbnailUrl,
  modalHref,
  contentLanguage,
  outboundUrl,
}: {
  item: Pick<RssFeedItem, 'id' | 'data' | 'rss_feed'>
  view: FeedStyle
  embed?: UrlEmbed
  audio: EmbedAudio
  previewTitle: string | null
  excerpt: string | null
  fallbackExcerpt: string | null
  videoPlatform: string | null | undefined
  renderedThumbnailUrl: string | null | undefined
  modalHref: string
  contentLanguage: string | undefined
  outboundUrl: string
}) {
  const uiLocale = useUiLocale()
  const t = useTranslations()
  return (
    <>
      {audio.mediaType === 'audio' && audio.enclosureUrl && (
        <CardContent className='pb-0 pt-0'>
          <PodcastEpisodePlayer
            episode={{
              episodeId: item.id,
              enclosureUrl: audio.enclosureUrl,
              enclosureType: audio.enclosureType,
              durationSeconds: audio.durationSeconds,
              title: previewTitle ?? '',
              showId: item.rss_feed.id,
              showTitle: item.rss_feed.title,
              coverArtUrl:
                renderedThumbnailUrl ?? item.rss_feed.podcast_show?.cover_art_url ?? undefined,
              showHref: topicHref(item.rss_feed.topic, 'latest'),
            }}
          />
        </CardContent>
      )}
      {audio.mediaType === 'video' && (
        <CardContent className='pb-2 pt-0'>
          <VideoEmbed
            platform={videoPlatform ?? ''}
            playerUrl={selectAuthorizedPlayerUrl(embed, item.data.player_url)}
            videoId={item.data.video_id}
            thumbnailUrl={renderedThumbnailUrl ?? undefined}
            title={previewTitle ?? undefined}
            itemUrl={outboundUrl}
          />
        </CardContent>
      )}
      {view === 'summary' && (excerpt || fallbackExcerpt || videoPlatform === 'youtube') && (
        <CardContent className='pt-0 pb-2'>
          {excerpt && (
            <Link
              href={modalHref}
              scroll={false}
              prefetch={false}
              className='flex gap-3 -m-2 rounded p-2 hover:bg-muted/50'
            >
              <p
                className='line-clamp-3 flex-1 text-sm text-muted-foreground'
                data-pw='news-item-excerpt'
                lang={contentLanguage}
                dir={getContentLanguageDir(contentLanguage)}
              >
                {excerpt}
              </p>
              {renderedThumbnailUrl && audio.mediaType !== 'video' && (
                <Image
                  src={renderedThumbnailUrl}
                  alt=''
                  width={128}
                  height={80}
                  unoptimized
                  loading='lazy'
                  decoding='async'
                  className='h-20 w-32 shrink-0 rounded bg-muted object-cover'
                />
              )}
            </Link>
          )}
          <YoutubeRssMetadataRow
            item={item}
            uiLocale={uiLocale}
            className={excerpt ? 'mt-1.5' : undefined}
            t={t}
          />
        </CardContent>
      )}
    </>
  )
}
