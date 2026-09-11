import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { UpdateReferralLinkCrawlResult } from './types.mts'

const MAX_CONSECUTIVE_FAILURES = 3

export async function updateReferralLinkAfterCrawl(
  linkId: string,
  result: UpdateReferralLinkCrawlResult,
): Promise<void> {
  await write(sql`/* updateReferralLinkAfterCrawl */
    UPDATE user_referral_program_links
    SET consecutive_crawl_failures = CASE
          WHEN ${result.success} THEN 0
          WHEN ${result.immediateDeactivation ?? false} THEN consecutive_crawl_failures
          ELSE consecutive_crawl_failures + 1
        END,
        last_crawl_success_at = CASE
          WHEN ${result.success} THEN CURRENT_TIMESTAMP
          ELSE last_crawl_success_at
        END,
        last_crawl_failure_at = CASE
          WHEN ${!result.success && !(result.immediateDeactivation ?? false)} THEN CURRENT_TIMESTAMP
          ELSE last_crawl_failure_at
        END,
        last_crawl_id = CASE
          WHEN ${result.success} AND ${result.crawlId ?? null}::uuid IS NOT NULL THEN ${result.crawlId ?? null}::uuid
          ELSE last_crawl_id
        END,
        activated_at = CASE
          WHEN ${result.immediateDeactivation ?? false} THEN NULL
          WHEN ${!result.success} AND consecutive_crawl_failures + 1 >= ${MAX_CONSECUTIVE_FAILURES} THEN NULL
          ELSE activated_at
        END,
        deactivated_at = CASE
          WHEN ${result.immediateDeactivation ?? false} THEN CURRENT_TIMESTAMP
          WHEN ${!result.success} AND consecutive_crawl_failures + 1 >= ${MAX_CONSECUTIVE_FAILURES} THEN CURRENT_TIMESTAMP
          ELSE deactivated_at
        END
    WHERE id = ${linkId}
  `)
}
