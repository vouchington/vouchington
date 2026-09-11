import { ProxiedImage as Image } from '@/components/shared/proxied-image'
import { Mic, Lock } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { AsideAccordion } from '@/components/asides/aside-accordion'
import { getTopicDisplayName } from '@/lib/topics/display-name'
import { podcastCategoryHref } from '@/lib/links/entity-href'
import type { ViewRssFeed } from '@/types/rss-feeds'
import { getTranslations } from '@/lib/i18n/get-translations'

interface PodcastShowMetadataAsideProps {
  feed: ViewRssFeed
}

/**
 * Aside section for podcast show metadata on /source/[id] pages.
 * Shows cover art, author, explicit badge, and Apple category chips.
 * Only rendered when feed_type === 'podcast'.
 */
export async function PodcastShowMetadataAside({ feed }: PodcastShowMetadataAsideProps) {
  const t = await getTranslations()
  const show = feed.podcast_show
  if (!show && !feed.categories?.length) return null

  const title = feed.title?.trim() || getTopicDisplayName(feed.topic, { feedType: feed.feed_type })
  const coverArtUrl = show?.cover_art_url ?? null
  const author = show?.itunes_author ?? null
  const isExplicit = show?.is_explicit ?? false
  const description = show?.description ?? null
  const categories = feed.categories ?? []

  return (
    <AsideAccordion
      title={t('extracted.podcasts.podcastShowMetadataAside.aboutThisPodcast_36d99c8d')}
      data-pw='podcast-show-metadata-aside'
    >
      {description && (
        <p
          className='mb-3 line-clamp-3 text-sm text-muted-foreground'
          data-pw='podcast-source-description'
        >
          {description}
        </p>
      )}
      <div className='flex gap-3'>
        <div className='shrink-0'>
          {coverArtUrl ? (
            <Image
              src={coverArtUrl}
              alt={t('extracted.podcasts.podcastShowMetadataAside.titleCoverArt_2176bb35', {
                title,
              })}
              width={72}
              height={72}
              className='rounded-md object-cover'
              data-pw='podcast-source-cover-art'
            />
          ) : (
            <div
              className='flex h-18 w-18 items-center justify-center rounded-md bg-muted'
              aria-hidden='true'
            >
              <Mic className='h-7 w-7 text-muted-foreground' />
            </div>
          )}
        </div>

        <div className='min-w-0 flex-1 space-y-1'>
          {author && (
            <p
              className='truncate text-sm text-muted-foreground'
              data-pw='podcast-source-author'
            >
              {t('extracted.podcasts.podcastShowMetadataAside.byAuthor_c63374c5', { author })}
            </p>
          )}

          {(isExplicit || categories.length > 0) && (
            <div className='flex flex-wrap items-center gap-1.5'>
              {isExplicit && (
                <Badge
                  variant='secondary'
                  className='gap-1 text-xs'
                  data-pw='podcast-source-explicit-badge'
                >
                  <Lock className='h-2.5 w-2.5' />
                  {t('extracted.podcasts.podcastShowMetadataAside.explicit_d863c482')}
                </Badge>
              )}
              {categories.slice(0, 3).map(cat => {
                const chip = (
                  <Badge
                    variant='outline'
                    className={`text-xs capitalize${cat.topic_slug ? ' hover:bg-accent' : ''}`}
                    data-pw='podcast-source-category-chip'
                  >
                    {cat.category_text}
                  </Badge>
                )
                return cat.topic_slug ? (
                  <Link
                    key={cat.category_text}
                    href={podcastCategoryHref(cat.topic_slug)}
                    prefetch={false}
                  >
                    {chip}
                  </Link>
                ) : (
                  <span key={cat.category_text}>{chip}</span>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </AsideAccordion>
  )
}
