import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 } from 'uuid'

export function createTestUserReferralProgramLinkIdAt(at: Date): string {
  return v7({ msecs: at.getTime() })
}

export async function insertTestUserReferralProgramLink(opts: {
  id?: string
  userId: string
  referralProgramId: string
  urlId: string
  label?: string
  parentLinkId?: string
}): Promise<string> {
  const statement = sql`/* insertTestUserReferralProgramLink */
    INSERT INTO user_referral_program_links (
  `
  if (opts.id !== undefined) statement.append(sql`id,`)
  statement.append(sql`
      user_id,
      referral_program_topic_id,
      url_id,
      label,
      activated_at,
      parent_link_id,
      created_via
    )
    VALUES (
  `)
  if (opts.id !== undefined) statement.append(sql`${opts.id}::uuid,`)
  statement.append(sql`
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
  const { rows } = await write(statement)
  return rows[0]!.id as string
}

export type ReferralLinkCrawlStatus = {
  consecutive_crawl_failures: number
  last_crawl_success_at: Date | null
  last_crawl_failure_at: Date | null
  activated_at: Date | null
  deactivated_at: Date | null
}

/**
 * Get crawl-status columns for a referral link
 */
export async function getReferralLinkCrawlStatus(linkId: string): Promise<ReferralLinkCrawlStatus> {
  const { rows } = await read<ReferralLinkCrawlStatus>(
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

export async function getActiveChildUrlIdsForTest(parentLinkId: string): Promise<string[]> {
  const { rows } = await read<{ url_id: string }>(sql`/* getActiveChildUrlIdsForTest */
    SELECT url_id
    FROM user_referral_program_links
    WHERE parent_link_id = ${parentLinkId}
      AND deleted_at IS NULL
  `)
  return rows.map(row => row.url_id)
}
