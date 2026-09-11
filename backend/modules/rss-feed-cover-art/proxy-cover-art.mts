import { buildSideloadImageUrl } from '@ts-shared/url-signing'
import { getImageOrigin } from '@modules/utils/image-origin'
import type { ViewRssFeed } from '@voucha/types/entities/rss-feed'
import { getSigningKeys } from './signing-keys.mts'

/**
 * Proxy the raw cover_art_url to an absolute image-host /sideload/ URL at response time.
 * The raw URL is kept in the DB so signing-key rotation requires no data backfill.
 * Returns the feed unchanged when there is no cover art or the URL cannot be proxied.
 */
export function proxyRssFeedCoverArt(feed: ViewRssFeed): ViewRssFeed {
  if (!feed.podcast_show?.cover_art_url) return feed
  const proxied = buildSideloadImageUrl(feed.podcast_show.cover_art_url, {
    imageOrigin: getImageOrigin(),
    width: 400,
    signingKeys: getSigningKeys(),
  })
  if (!proxied) return { ...feed, podcast_show: { ...feed.podcast_show, cover_art_url: null } }
  return { ...feed, podcast_show: { ...feed.podcast_show, cover_art_url: proxied } }
}
