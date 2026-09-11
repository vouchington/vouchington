import type { PrivateUser } from '@services/users/types'
import { read } from '@data-stores/psql'
import { createCrawler } from './create-crawler.mts'
import { updateCrawler } from './update-crawler.mts'
import type { Crawler } from './types.mts'

export async function upsertCrawlerForReferralProgram(
  admin: PrivateUser,
  hostnameId: string,
  referralProgramId: string,
  updates: {
    crawler_type?: Crawler['crawler_type']
    css_selectors_to_remove?: string[]
    content_selectors?: string[]
  },
): Promise<Crawler> {
  const { rows } = await read(
    `/* upsertCrawlerForReferralProgram */
    SELECT id
    FROM crawlers
    WHERE hostname_id = $1
      AND referral_program_id = $2
      AND deleted_at IS NULL
    ORDER BY priority DESC, id ASC
    LIMIT 1`,
    [hostnameId, referralProgramId],
  )

  if (rows.length > 0) {
    return updateCrawler(admin, rows[0].id as string, updates)
  }

  return createCrawler(admin, {
    hostname_id: hostnameId,
    referral_program_id: referralProgramId,
    crawler_type: updates.crawler_type ?? 'fetch',
    css_selectors_to_remove: updates.css_selectors_to_remove,
    content_selectors: updates.content_selectors,
  })
}
