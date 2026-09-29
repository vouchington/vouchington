import { read, write } from '@data-stores/psql'
import { v7 } from 'uuid'
import { insertTestReferralProgram } from './cards.mts'
import { insertTestCrawl } from './crawls.mts'
import { insertTestUserReferralProgramLink } from './referral-links.mts'
import { createTestUrlWithHostname } from './urls.mts'
import { createTestUser } from './users.mts'

/** A committed referral link whose `last_crawl_id` points at a committed crawl. A `crawlCreatedAt`
 * places the crawl (a UUIDv7-range partitioned row) in that month's partition. */
export async function createTestReferralLinkWithLastCrawl(
  crawlCreatedAt?: Date,
): Promise<{ linkId: string; crawlId: string }> {
  const user = await createTestUser()
  const referralProgramId = await insertTestReferralProgram({ createdById: user.id })
  const urlId = await createTestUrlWithHostname()
  const linkId = await insertTestUserReferralProgramLink({
    userId: user.id,
    referralProgramId,
    urlId,
  })
  const crawl = await insertTestCrawl({
    id: crawlCreatedAt && v7({ msecs: crawlCreatedAt.getTime() }),
    urlId,
    statusCode: 200,
    markdown: '',
  })
  await write(
    `/* setTestReferralLinkLastCrawl */
    UPDATE user_referral_program_links SET last_crawl_id = $2 WHERE id = $1`,
    [linkId, crawl.id],
  )
  return { linkId, crawlId: crawl.id }
}

export async function readTestReferralLinkLastCrawl(
  linkId: string,
): Promise<{ exists: boolean; lastCrawlId: string | null }> {
  const { rows } = await read<{ last_crawl_id: string | null }>(
    `/* readTestReferralLinkLastCrawl */
    SELECT last_crawl_id FROM user_referral_program_links WHERE id = $1`,
    [linkId],
  )
  return { exists: rows.length === 1, lastCrawlId: rows[0]?.last_crawl_id ?? null }
}

export async function deleteTestCrawl(crawlId: string): Promise<void> {
  await write(`/* deleteTestCrawl */ DELETE FROM crawls WHERE id = $1`, [crawlId])
}
