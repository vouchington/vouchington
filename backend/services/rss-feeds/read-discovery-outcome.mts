import { write } from '@data-stores/psql'
import { normalizeUrlForUrlTable } from '@modules/utils/urls'
import sql from 'sql-template-strings'
import { RssFeedDiscoveryPendingError } from './discovery-pending.mts'
import type { discoverFeedUrlFromHtml } from './discover-feed.mts'
import { createMissingFeedContentError } from './missing-feed-content-error.mts'

type RssFeedImportPageDiscoveryOutcome =
  | { kind: 'pending' }
  | { kind: 'failed' }
  | { kind: 'discovered'; feedUrl: string }

/** Reads this import row's durable outcome before a retry fetches the page again. */
async function readRssFeedImportPageDiscoveryOutcome(
  pageUrl: string,
  importRowId: string,
): Promise<RssFeedImportPageDiscoveryOutcome | null> {
  const preserveHttp = new URL(pageUrl).protocol === 'http:'
  const normalizedPageUrl = normalizeUrlForUrlTable(pageUrl, { preserveHttp }).toString()
  const { rows } = await write<{
    discovered_feed_url: string | null
    failed_at: Date | null
  }>(sql`/* readRssFeedImportPageDiscoveryOutcome */
    SELECT discovered.url AS discovered_feed_url, discovery.failed_at
    FROM user_rss_feed_import_row_discoveries discovery
    JOIN urls page ON page.id = discovery.discovery_url_id
    LEFT JOIN urls discovered ON discovered.id = discovery.discovered_feed_url_id
    WHERE discovery.import_row_id = ${importRowId}
      AND page.url = ${normalizedPageUrl}
  `)
  const outcome = rows[0]
  if (!outcome) return null
  if (outcome.discovered_feed_url)
    return { kind: 'discovered', feedUrl: outcome.discovered_feed_url }
  if (outcome.failed_at) return { kind: 'failed' }
  return { kind: 'pending' }
}

export async function resumeRssFeedImportPageDiscovery(
  pageUrl: string,
  importRowId: string,
  discover: typeof discoverFeedUrlFromHtml,
): Promise<{ kind: 'redirect'; location: string; isPermanent: false } | null> {
  const outcome = await readRssFeedImportPageDiscoveryOutcome(pageUrl, importRowId)
  if (outcome?.kind === 'discovered')
    return { kind: 'redirect', location: outcome.feedUrl, isPermanent: false }
  if (outcome?.kind === 'failed') throw createMissingFeedContentError()
  if (outcome?.kind === 'pending') {
    const discovered = await discover(pageUrl, importRowId)
    if (discovered) return { kind: 'redirect', location: discovered, isPermanent: false }
    throw new RssFeedDiscoveryPendingError()
  }
  return null
}
