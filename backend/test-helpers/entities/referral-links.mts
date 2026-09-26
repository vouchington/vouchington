/**
 * User referral program links entity test helpers
 */

import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 } from 'uuid'

export async function insertTestUserReferralProgramLink(opts: {
  userId: string
  referralProgramId: string
  urlId: string
  label?: string
  parentLinkId?: string
}): Promise<string> {
  const { rows } = await write(sql`/* insertTestUserReferralProgramLink */
    INSERT INTO user_referral_program_links (
      user_id,
      referral_program_id,
      url_id,
      label,
      activated_at,
      parent_link_id,
      created_via
    )
    VALUES (
      ${opts.userId},
      ${opts.referralProgramId},
      ${opts.urlId},
      ${opts.label ?? `test-link-${v7()}`},
      CURRENT_TIMESTAMP,
      ${opts.parentLinkId ?? null},
      'system'
    )
    RETURNING id
  `)
  return rows[0]!.id as string
}

export type ReferralLinkCrawlStatus = {
  consecutive_crawl_failures: number
  last_crawl_success_at: string | null
  last_crawl_failure_at: string | null
  activated_at: string | null
  deactivated_at: string | null
}

/**
 * Get crawl-status columns for a referral link
 */
export async function getReferralLinkCrawlStatus(linkId: string): Promise<ReferralLinkCrawlStatus> {
  const { rows } = await read(
    sql`/* getReferralLinkCrawlStatus */
    SELECT consecutive_crawl_failures, last_crawl_success_at, last_crawl_failure_at,
           activated_at, deactivated_at
    FROM user_referral_program_links WHERE id = ${linkId}`,
  )
  return rows[0]
}

export async function getReferralLinkLastCrawlId(linkId: string): Promise<string | null> {
  const { rows } = await read(
    sql`/* getReferralLinkLastCrawlId */
    SELECT last_crawl_id
    FROM user_referral_program_links
    WHERE id = ${linkId}`,
  )
  return (rows[0]?.last_crawl_id as string | null | undefined) ?? null
}

/**
 * Set consecutive_crawl_failures and last_crawl_failure_at for a referral link
 */
export async function setReferralLinkCrawlFailures(linkId: string, count: number): Promise<void> {
  await write(sql`/* setReferralLinkCrawlFailures */
    UPDATE user_referral_program_links
    SET consecutive_crawl_failures = ${count},
        last_crawl_failure_at = CURRENT_TIMESTAMP
    WHERE id = ${linkId}
  `)
}

/**
 * Set last_crawl_success_at to NOW() so the link appears recently crawled (excluded from dispatch)
 */
export async function setReferralLinkLastCrawlSuccessAtRecent(linkId: string): Promise<void> {
  await write(sql`/* setReferralLinkLastCrawlSuccessAtRecent */
    UPDATE user_referral_program_links
    SET last_crawl_success_at = CURRENT_TIMESTAMP
    WHERE id = ${linkId}
  `)
}

/**
 * Soft-delete a referral link
 */
export async function softDeleteReferralLink(linkId: string): Promise<void> {
  await write(sql`/* softDeleteReferralLink */
    UPDATE user_referral_program_links
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = ${linkId}
  `)
}

/**
 * Check if a referral link would be included in the dispatch query
 * (active, not recently crawled, hostname crawlable)
 */
export async function isReferralLinkDispatchable(linkId: string): Promise<boolean> {
  const { rows } = await read(
    sql`/* isReferralLinkDispatchable */
    SELECT urpl.id
    FROM user_referral_program_links urpl
    JOIN urls u ON u.id = urpl.url_id
    JOIN url_hostnames h ON h.id = u.hostname_id
    WHERE urpl.activated_at IS NOT NULL
      AND urpl.deactivated_at IS NULL
      AND urpl.deleted_at IS NULL
      AND h.crawlable = true
      AND h.blocked = false
      AND (urpl.last_crawl_success_at IS NULL OR urpl.last_crawl_success_at < NOW() - INTERVAL '7 days')
      AND (urpl.last_crawl_failure_at IS NULL OR urpl.last_crawl_failure_at < NOW() - INTERVAL '1 hour')
      AND urpl.id = ${linkId}`,
  )
  return rows.length > 0
}

/**
 * Get hostname grouping for a set of referral links in the dispatch query
 */
export async function getReferralLinkDispatchRows(
  linkIds: string[],
): Promise<{ link_id: string; hostname_id: string; hostname: string }[]> {
  if (linkIds.length === 0) return []
  const { rows } = await read(
    sql`/* getReferralLinkDispatchRows */
    SELECT urpl.id AS link_id, h.id AS hostname_id, h.hostname
    FROM user_referral_program_links urpl
    JOIN urls u ON u.id = urpl.url_id
    JOIN url_hostnames h ON h.id = u.hostname_id
    WHERE urpl.activated_at IS NOT NULL
      AND urpl.deactivated_at IS NULL
      AND urpl.deleted_at IS NULL
      AND h.crawlable = true
      AND h.blocked = false
      AND (urpl.last_crawl_success_at IS NULL OR urpl.last_crawl_success_at < NOW() - INTERVAL '7 days')
      AND (urpl.last_crawl_failure_at IS NULL OR urpl.last_crawl_failure_at < NOW() - INTERVAL '1 hour')
      AND urpl.id = ANY(${linkIds})
    ORDER BY h.id, urpl.id`,
  )
  return rows as { link_id: string; hostname_id: string; hostname: string }[]
}

/**
 * Check if a URL is excluded from HTML crawler tier dispatch
 * (referral links are excluded from Tier 1 and Tier 2)
 */
export async function isUrlActiveReferralLink(urlId: string): Promise<boolean> {
  const { rows } = await read(
    sql`/* isUrlActiveReferralLink */
    SELECT 1 FROM user_referral_program_links urpl
    WHERE urpl.url_id = ${urlId}
      AND urpl.deleted_at IS NULL
      AND urpl.activated_at IS NOT NULL`,
  )
  return rows.length > 0
}

/**
 * Check if a URL is excluded from HTML crawler dispatch due to RSS feed
 */
export async function isUrlRssFeedUrl(urlId: string): Promise<boolean> {
  const { rows } = await read(
    sql`/* isUrlRssFeedUrl */
    SELECT 1 FROM rss_feeds rf
    WHERE rf.rss_feed_url_id = ${urlId}
      AND rf.deleted_at IS NULL`,
  )
  return rows.length > 0
}
