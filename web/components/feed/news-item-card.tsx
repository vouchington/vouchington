'use client'

import { Suspense, type ReactNode, type ElementType } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { Card, CardContent } from '@/components/ui/card'
import type { RssFeedItem } from '@/types/rss-feed-items'
import type { FeedStyle } from '@/lib/preferences/shared'
import { RSS_ITEM_PARAM } from '@/lib/rss-item-modal'
import type { PublicUser } from '@/types/user'
import { stripHtmlTags } from '@/lib/utils/strip-html-tags'
import { decodeHtmlEntities } from '@ts-shared/utils/html'
import { selectEmbedAudio, selectEmbedPreview } from '@/lib/embeds/embed-preview'
import type { UrlEmbed } from '@/types/api-responses/posts-topics-and-feeds'
import { appendUtm, isExternalHref, OUTBOUND_UTM } from '@/lib/url/utm'
import { NewsItemCardHeader } from './news-item-card-header'
import { NewsItemCardMedia } from './news-item-card-media'

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
  sharedByUser?: Pick<PublicUser, 'id' | 'username' | 'account_type'>
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
  const authoredTitle = preview.title ? decodeHtmlEntities(preview.title) : null
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
      <NewsItemCardHeader
        item={item}
        badge={badge}
        sharedByUser={sharedByUser}
        sharedAt={sharedAt}
        isAuthenticated={isAuthenticated}
        outboundUrl={outboundUrl}
        authoredTitle={authoredTitle}
      />
      <NewsItemCardMedia
        item={item}
        view={view}
        embed={embed}
        audio={audio}
        previewTitle={preview.title}
        excerpt={excerpt}
        fallbackExcerpt={fallbackExcerpt}
        videoPlatform={videoPlatform}
        renderedThumbnailUrl={renderedThumbnailUrl}
        modalHref={modalHref}
        contentLanguage={contentLanguage}
        outboundUrl={outboundUrl}
      />
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
