'use client'

// oxlint-disable eslint/max-lines -- card includes kebab with report, community discussion, share actions
import { Suspense, type ReactNode, type ElementType } from 'react'
import Link from 'next/link'
import { ProxiedImage as Image } from '@/components/shared/proxied-image'
import dynamic from 'next/dynamic'
import { usePathname, useSearchParams } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { useAuth } from '@/lib/auth/context'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { SharedByline } from '@/components/shared/shared-byline'
import type { RssFeedItem } from '@/types/rss-feed-items'
import type { FeedStyle } from '@/lib/preferences/shared'
import { RSS_ITEM_PARAM } from '@/lib/rss-item-modal'
import type { PublicUser } from '@/types/user'
import { stripHtmlTags } from '@/lib/utils/strip-html-tags'
import { decodeHtmlEntities } from '@ts-shared/utils/html'
import { NewsItemHeader } from '@/components/news/news-item-header'
import { YoutubeRssMetadataRow } from '@/components/news/youtube-rss-metadata-row'
import { PodcastEpisodePlayer } from './podcast-episode-player'
import { VideoEmbed } from './video-embed'
import {
  selectAuthorizedPlayerUrl,
  selectEmbedAudio,
  selectEmbedPreview,
} from '@/lib/embeds/embed-preview'
import type { UrlEmbed } from '@/types/api-responses/posts-topics-and-feeds'
import { ManageCategoriesMenuItem } from './manage-categories-menu-item'
import { appendUtm, isExternalHref, OUTBOUND_UTM } from '@/lib/url/utm'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { useTranslations } from '@/lib/i18n/use-translations'
import { topicHref } from '@/lib/links/entity-href'
import { getContentLanguageDir } from '@ts-shared/languages/content-languages'
import type { ReportMenuItem as ReportMenuItemComponent } from '@/components/shared/report-menu-item'

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const FollowerShareActions = dynamic(() =>
  import('@/components/shared/follower-share-actions').then(mod => mod.FollowerShareActions),
)

const ReportMenuItem = dynamic<Parameters<typeof ReportMenuItemComponent>[0]>(
  () => import('@/components/shared/report-menu-item').then(mod => mod.ReportMenuItem),
  { ssr: false },
)

interface NewsItemCardProps {
  item: Pick<
    RssFeedItem,
    | 'id'
    | 'published_at'
    | 'data'
    | 'url'
    | 'rss_feed'
    | 'categories'
    | 'lingua_rs_detected_language'
  >
  view?: FeedStyle
  badge?: ReactNode
  /** Proxied `/sideload/` thumbnail URL. Shown right-aligned in the summary block. */
  thumbnailUrl?: string
  /** Backend-selected crawl embed sidecar for this RSS item. */
  embed?: UrlEmbed
  sharedByUser?: Pick<PublicUser, 'id' | 'username' | 'is_official_account'>
  sharedAt?: string
  /** Optional content at the bottom of the card. Accepts a ReactNode or a render-prop
   *  receiving `modalHref` (so callers can include a Show more link in the action row). */
  footer?: ((modalHref: string) => ReactNode) | ReactNode
  /**
   * When true, renders without the Card border/bg/shadow wrapper — suitable for
   * member items nested inside a story Card. Internal padding and layout are unchanged.
   */
  bare?: boolean
}

function NewsItemCardContent({
  item,
  view = 'summary',
  badge,
  thumbnailUrl,
  embed,
  sharedByUser,
  sharedAt,
  footer,
  bare = false,
}: NewsItemCardProps) {
  const pathname = usePathname()
  const currentSearchParams = useSearchParams()
  const { isAuthenticated } = useAuth()
  const uiLocale = useUiLocale()
  const t = useTranslations()

  const preview = selectEmbedPreview(embed, {
    title: item.data.title,
    description: firstNonBlankExcerpt(
      item.data.contentSnippet,
      item.data.description,
      item.data['media:description'],
      item.data.summary,
    ),
    thumbnailUrl,
    sourceUrl: item.url.url,
  })
  const title = decodeHtmlEntities(preview.title ?? 'Untitled')
  const excerpt = preview.description
  const renderedThumbnailUrl = preview.thumbnailUrl
  const videoPlatform = preview.platform ?? embed?.video_platform ?? item.data.video_platform
  const audio = selectEmbedAudio(embed, item.data)

  /* Existing RSS data remains the fallback when the crawl has no embed. */
  const fallbackExcerpt = firstNonBlankExcerpt(
    item.data.contentSnippet,
    item.data.description,
    item.data['media:description'],
    item.data.summary,
  )
  const contentLanguage = item.lingua_rs_detected_language ?? undefined

  const modalSearchParams = new URLSearchParams(currentSearchParams?.toString() ?? '')
  modalSearchParams.set(RSS_ITEM_PARAM, item.id)
  const modalHref = `${pathname}?${modalSearchParams.toString()}`

  const footerContent = typeof footer === 'function' ? footer(modalHref) : footer
  const outboundUrl = isExternalHref(item.url.url)
    ? appendUtm(item.url.url, OUTBOUND_UTM)
    : item.url.url

  const inner = (
    <>
      <CardHeader className='gap-2 pb-2'>
        <div className={isAuthenticated ? 'space-y-1 pr-12' : 'space-y-1'}>
          <SharedByline
            sharedByUser={sharedByUser}
            sharedAt={sharedAt}
          />
          {badge}
          <Link
            href={outboundUrl}
            target='_blank'
            rel='nofollow noopener noreferrer'
            prefetch={false}
            className='text-base font-semibold leading-tight hover:underline'
            data-pw='news-item-title-link'
          >
            {title}{' '}
            <ExternalLink className='inline-block h-3 w-3 shrink-0 align-baseline text-muted-foreground' />
          </Link>
        </div>
        <NewsItemHeader item={item} />
        <FollowerShareActions
          entityType='rss_feed_item'
          entityId={item.id}
          compact
          className='absolute right-2 top-2'
          menuLeadingItems={
            <>
              {isAuthenticated && <ManageCategoriesMenuItem entityId={item.id} />}
              {isAuthenticated && (
                <ReportMenuItem
                  entityType='rss_feed_item'
                  entityId={item.id}
                />
              )}
            </>
          }
        />
      </CardHeader>
      {audio.mediaType === 'audio' && audio.enclosureUrl && (
        <CardContent className='pb-0 pt-0'>
          <PodcastEpisodePlayer
            episode={{
              episodeId: item.id,
              enclosureUrl: audio.enclosureUrl,
              enclosureType: audio.enclosureType,
              durationSeconds: audio.durationSeconds,
              title: preview.title ?? '',
              showId: item.rss_feed.id,
              showTitle: item.rss_feed.title,
              coverArtUrl:
                preview.thumbnailUrl ?? item.rss_feed.podcast_show?.cover_art_url ?? undefined,
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
            title={preview.title ?? undefined}
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
      {footerContent !== undefined && (
        <CardContent className='pt-0 pb-2'>{footerContent}</CardContent>
      )}
    </>
  )

  const Root = (bare ? 'article' : Card) as ElementType
  return (
    <Root
      data-pw='news-item-card'
      data-rss-item-id={item.id}
      className='relative'
    >
      {inner}
    </Root>
  )
}

export function NewsItemCard(props: NewsItemCardProps) {
  return (
    <Suspense fallback={null}>
      <NewsItemCardContent {...props} />
    </Suspense>
  )
}

function firstNonBlankExcerpt(...fields: Array<string | undefined>): string | null {
  return fields.map(field => stripHtmlTags(field || '')).find(Boolean) || null
}
