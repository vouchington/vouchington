import { buildSideloadImageUrl } from '@ts-shared/url-signing'
import { getImageOrigin } from '@modules/utils/image-origin'
import type { ViewRssFeedItem } from './types.mts'
import { getSigningKeys } from './signing-keys.mts'

/**
 * Build a map of proxied thumbnail URLs for a batch of RSS feed items.
 *
 * Keys are item IDs; values are `/sideload/` proxy URLs at 400px width.
 * Items with no thumbnail or a non-proxiable thumbnail URL are omitted.
 * The raw URL is kept in the DB; this rewrite happens at API-response time
 * so key rotation never requires a data backfill.
 */
export function proxyThumbnailUrls(items: ViewRssFeedItem[]): Record<string, string> {
  const signingKeys = getSigningKeys()
  const result: Record<string, string> = {}
  for (const item of items) {
    const raw = item.data.thumbnail_url
    if (!raw) continue
    const proxied = buildSideloadImageUrl(raw, {
      imageOrigin: getImageOrigin(),
      width: 400,
      signingKeys,
    })
    if (proxied) result[item.id] = proxied
  }
  return result
}
