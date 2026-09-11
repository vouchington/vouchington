'use client'

import { VideoEmbed } from '@/components/feed/video-embed'
import { EmbedPreviewCard } from '@/components/shared/embed-preview-card'
import { selectEmbedPreview } from '@/lib/embeds/embed-preview'
import { PodcastEpisodePlayer } from '@/components/feed/podcast-episode-player'
import { topicHref } from '@/lib/links/topic-hrefs'
import type { UrlEmbed } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

interface LinkPostMediaProps {
  embed: UrlEmbed
  // view only affects the article fallback: card → compact thumbnail, detail → full-width hero.
  // Video and audio embeds render at full size in both contexts.
  view: 'card' | 'detail'
}

function isHttpsUrl(url: string | null): url is string {
  return url != null && /^https:\/\//i.test(url)
}

export function LinkPostMedia({ embed, view }: LinkPostMediaProps) {
  const t = useTranslations()
  const { media_type, video_platform, enclosure_url, show_id, source_url } = embed
  const preview = selectEmbedPreview(embed)
  const hasRichPreview = Boolean(
    preview.thumbnailUrl ||
    preview.title ||
    preview.description ||
    embed.provider_name ||
    embed.embed_metadata?.provider?.name ||
    Object.entries(embed.meta_tags ?? {}).some(
      ([key, value]) =>
        key.toLowerCase() === 'og:site_name' && typeof value === 'string' && value.trim(),
    ),
  )

  if (media_type === 'video' && (video_platform || preview.platform)) {
    return (
      <div data-pw='link-post-video-embed'>
        <VideoEmbed
          platform={preview.platform ?? video_platform ?? ''}
          playerUrl={preview.playerUrl}
          videoId={embed.video_id ?? undefined}
          thumbnailUrl={preview.thumbnailUrl ?? undefined}
          title={preview.title ?? undefined}
          itemUrl={source_url ?? undefined}
        />
      </div>
    )
  }

  if (media_type === 'audio' && enclosure_url) {
    if (show_id && embed.rss_feed_item_id && embed.show_topic_slug && embed.show_topic_type) {
      const showHref = topicHref(
        { topic_type: embed.show_topic_type, slug: embed.show_topic_slug },
        'latest',
      )
      return (
        <div
          className='rounded-md border bg-muted/30 p-4'
          data-pw='link-post-podcast-embed'
        >
          <PodcastEpisodePlayer
            episode={{
              episodeId: embed.rss_feed_item_id,
              enclosureUrl: enclosure_url,
              enclosureType: embed.enclosure_type ?? undefined,
              durationSeconds: embed.duration_seconds ?? undefined,
              title: embed.title ?? t('extracted.linkPostMedia.index.podcastEpisode_50517101'),
              showId: show_id,
              showTitle: embed.show_title ?? undefined,
              coverArtUrl: embed.thumbnail_url ?? undefined,
              showHref,
            }}
          />
        </div>
      )
    }

    const audioSrc = enclosure_url.replace(/^http:\/\//i, 'https://')
    return (
      <div
        className='rounded-md border bg-muted/30 p-4'
        data-pw='link-post-audio-embed'
      >
        {embed.title && <p className='mb-2 text-sm font-medium'>{embed.title}</p>}
        <audio
          controls
          src={audioSrc}
          className='w-full'
          preload='none'
        >
          <track kind='captions' />
          {t('extracted.linkPostMedia.index.yourBrowserDoesNotSupportThe_a21b58ba')}
        </audio>
      </div>
    )
  }

  // Article / source-only fallback
  if (!hasRichPreview) {
    if (!isHttpsUrl(source_url)) return null
    return (
      <a
        href={source_url}
        target='_blank'
        rel='nofollow ugc noopener noreferrer'
        className='block text-sm text-muted-foreground underline break-all'
        data-pw='link-post-source-url'
      >
        {source_url}
      </a>
    )
  }

  if (view === 'card') {
    return (
      <div data-pw='link-post-article-embed-card'>
        <EmbedPreviewCard preview={preview} />
      </div>
    )
  }

  // Detail view: full-width image + title
  const inner = (
    <div
      className='rounded-md border bg-muted/30 p-4'
      data-pw='link-post-article-embed-detail'
    >
      <EmbedPreviewCard
        preview={preview}
        layout='hero'
      />
    </div>
  )

  return inner
}
