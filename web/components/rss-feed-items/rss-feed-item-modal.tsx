import { Suspense } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { RssFeedItemModalShell } from './rss-feed-item-modal-shell'
import { MARKDOWN_CONTENT_FEATURES_RICH } from '@/components/shared/markdown-content-features'
import { MarkdownContent } from '@/components/shared/markdown-content'
import { getRssFeedItem } from '@/lib/api/server'
import { parseRssItemId, RSS_ITEM_PARAM } from '@/lib/rss-item-modal'
import { PodcastEpisodePlayer } from '@/components/feed/podcast-episode-player'
import { VideoEmbed } from '@/components/feed/video-embed'
import { decodeHtmlEntities } from '@ts-shared/utils/html'
import RssFeedItemFollowContext from './rss-feed-item-follow-context'
import { RssFeedItemViewTracker } from './rss-feed-item-view-tracker'
import { NewsItemActions } from '@/components/news/news-item-actions'
import { NewsItemHeader } from '@/components/news/news-item-header'
import { YoutubeRssMetadataRow } from '@/components/news/youtube-rss-metadata-row'
import { getResolvedUiLocale } from '@/lib/i18n/get-resolved-ui-locale'
import type { Post } from '@/types/posts'
import type { NewsCommunityDiscussionTarget } from '@/components/news/community-discussion-types'
import { stripHtmlTags } from '@/lib/utils/strip-html-tags'
import { topicHref } from '@/lib/links/entity-href'
import { getTranslations } from '@/lib/i18n/get-translations'
import { RssFeedItemHnDiscussionsAside } from '@/components/asides/rss-feed-item-hn-discussions-aside'
import { getContentLanguageDir } from '@ts-shared/languages/content-languages'
import {
  selectAuthorizedPlayerUrl,
  selectEmbedAudio,
  selectEmbedPreview,
} from '@/lib/embeds/embed-preview'
type SearchParams = Record<string, string | string[] | undefined>
const EMPTY_RELATED_POSTS: Post[] = []

const getStringValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value
function toUrlSearchParams(searchParams: SearchParams): URLSearchParams {
  const nextSearchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      value.forEach(entry => nextSearchParams.append(key, entry))
      continue
    }
    nextSearchParams.set(key, value)
  }
  return nextSearchParams
}
function buildModalUrl(pathname: string, searchParams: SearchParams, itemId?: string): string {
  const nextSearchParams = toUrlSearchParams(searchParams)
  nextSearchParams.delete(RSS_ITEM_PARAM)

  if (itemId) {
    nextSearchParams.set(RSS_ITEM_PARAM, itemId)
  }

  const query = nextSearchParams.toString()
  return query ? `${pathname}?${query}` : pathname
}
export async function RssFeedItemModal({
  pathname,
  searchParams,
  communityDiscussionTarget,
}: {
  pathname: string
  searchParams: SearchParams
  communityDiscussionTarget?: NewsCommunityDiscussionTarget
}) {
  const t = await getTranslations()
  const itemIdParam = getStringValue(searchParams[RSS_ITEM_PARAM])
  const parsedItem = parseRssItemId(itemIdParam)
  if (!parsedItem) return null
  const response = await getRssFeedItem(parsedItem.id)
  if (!response) return null
  const uiLocale = await getResolvedUiLocale()
  const item = response.rss_feed_item
  const embed = response.rss_feed_item_embeds?.[item.id]
  const preview = selectEmbedPreview(embed, {
    title: item.data.title,
    description: item.data.description ?? item.data.summary,
    thumbnailUrl: response.rss_feed_item_thumbnail_url?.[item.id],
    sourceUrl: item.url.url,
  })
  const contentHtml = response.content_html ?? null
  // Plain-text fallback when sanitized HTML is unavailable
  const textFallback = !contentHtml
    ? firstNonBlankTextFallback(
        preview.description ?? undefined,
        item.data['content:encodedSnippet'],
        item.data.contentSnippet,
        item.data.summary,
        item.data.description,
        item.data['media:description'],
      )
    : null
  const viewerBookmarks = response.bookmarks?.[item.id]
  const contentLanguage = item.lingua_rs_detected_language ?? undefined
  const audio = selectEmbedAudio(embed, item.data)
  return (
    <RssFeedItemModalShell
      closeUrl={buildModalUrl(pathname, searchParams)}
      previousUrl={null}
      nextUrl={null}
      currentItemId={item.id}
      title={decodeHtmlEntities(
        preview.title ??
          item.data.title ??
          t('extracted.rssFeedItems.rssFeedItemModal.untitledRssItem_c750dc33'),
      )}
      titleUrl={item.url.url}
      actions={
        <NewsItemActions
          item={item}
          election={response.rss_feed_item_election}
          electionVote={response.election_vote}
          relatedPosts={EMPTY_RELATED_POSTS}
          communityDiscussionTarget={communityDiscussionTarget}
          communityDiscussionUrls={[{ id: item.url.id, url: item.url.url }]}
          viewerBookmarks={viewerBookmarks}
          variant='modal-footer'
        />
      }
    >
      <div className='grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)]'>
        <div className='min-w-0 space-y-4'>
          <NewsItemHeader item={item} />
          {audio.mediaType === 'audio' && audio.enclosureUrl && (
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
          )}
          {audio.mediaType === 'video' && (
            <VideoEmbed
              platform={preview.platform ?? embed?.video_platform ?? ''}
              playerUrl={selectAuthorizedPlayerUrl(embed, item.data.player_url)}
              videoId={item.data.video_id}
              thumbnailUrl={preview.thumbnailUrl ?? undefined}
              title={preview.title ?? undefined}
              itemUrl={item.url.url}
            />
          )}
          <Card>
            <CardContent className='min-w-0 space-y-4 px-4 pt-6 sm:px-6'>
              {contentHtml ? (
                <MarkdownContent
                  html={contentHtml}
                  className='prose prose-sm max-w-none [overflow-wrap:anywhere] dark:prose-invert prose-img:max-w-full prose-pre:max-w-full prose-pre:overflow-x-auto'
                  features={MARKDOWN_CONTENT_FEATURES_RICH}
                  lang={contentLanguage}
                />
              ) : textFallback ? (
                <p
                  className='whitespace-pre-line break-words text-sm text-muted-foreground'
                  lang={contentLanguage}
                  dir={getContentLanguageDir(contentLanguage)}
                >
                  {textFallback}
                </p>
              ) : (
                <p className='text-sm text-muted-foreground'>
                  {t('extracted.rssFeedItems.rssFeedItemModal.noArticleSummaryAvailable_b043093e')}
                </p>
              )}
              <YoutubeRssMetadataRow
                item={item}
                uiLocale={uiLocale}
                t={t}
              />
            </CardContent>
          </Card>
          <Suspense fallback={null}>
            <RssFeedItemFollowContext id={item.id} />
          </Suspense>
        </div>
        <RssFeedItemHnDiscussionsAside url={item.url.url} />
      </div>
      <RssFeedItemViewTracker
        key={item.id}
        itemId={item.id}
      />
    </RssFeedItemModalShell>
  )
}
function firstNonBlankTextFallback(...fields: Array<string | undefined>): string | null {
  return (
    fields
      .map(field => decodeHtmlEntities(field || ''))
      .find(field => stripHtmlTags(field).trim()) ?? null
  )
}
