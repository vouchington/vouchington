import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { enqueueBulkFetchRssFeeds } from '@queues/rss-feeds/enqueues'
import { read } from '@data-stores/psql'
import { enqueueReferralLinkCrawlsForUrlId } from '@services/crawler-referral-links'
import { assertUserCanTriggerCrawl } from '@services/urls'
import type { PrivateUser } from '@services/users/types'
import sql from 'sql-template-strings'

export type ManualCrawlTarget = 'html_url' | 'rss_feed' | 'referral_link'

export type ManualCrawlEnqueueResult = {
  target: ManualCrawlTarget
  enqueued_count: number
  rss_feed_id?: string
}

async function getActiveRssFeedIdForUrlId(urlId: string): Promise<string | undefined> {
  const { rows } = await read<{ id: string }>(sql`/* getActiveRssFeedIdForUrlId */
    SELECT id
    FROM rss_feeds
    WHERE rss_feed_url_id = ${urlId}
      AND deleted_at IS NULL
    LIMIT 1
  `)
  return rows[0]?.id
}

async function isActiveReferralLinkUrlId(urlId: string): Promise<boolean> {
  const { rows } = await read<{ id: string }>(sql`/* isActiveReferralLinkUrlId */
    SELECT id
    FROM user_referral_program_links
    WHERE url_id = ${urlId}
      AND activated_at IS NOT NULL
      AND deactivated_at IS NULL
      AND deleted_at IS NULL
    LIMIT 1
  `)
  return rows.length > 0
}

export async function enqueueManualUrlCrawlAsCurrentUser(
  currentUser: PrivateUser,
  urlId: string,
): Promise<ManualCrawlEnqueueResult> {
  await assertUserCanTriggerCrawl(currentUser, urlId)

  const rssFeedId = await getActiveRssFeedIdForUrlId(urlId)
  if (rssFeedId) {
    await enqueueBulkFetchRssFeeds([rssFeedId], { ttl: 0, skipDeduplication: true })
    return { target: 'rss_feed', enqueued_count: 1, rss_feed_id: rssFeedId }
  }

  const referralCount = await enqueueReferralLinkCrawlsForUrlId(urlId)
  if (referralCount > 0) {
    return { target: 'referral_link', enqueued_count: referralCount }
  }

  if (await isActiveReferralLinkUrlId(urlId)) {
    return { target: 'referral_link', enqueued_count: 0 }
  }

  await enqueueBulkCrawlUrls([{ urlId }])
  return { target: 'html_url', enqueued_count: 1 }
}
