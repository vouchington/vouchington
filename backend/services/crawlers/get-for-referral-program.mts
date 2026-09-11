import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import createError from 'http-errors'
import { getOrCreateCrawlerForHostname } from './create-crawler.mts'
import { getCrawlerById, toCrawler } from './get.mts'
import type { Crawler } from './types.mts'

/**
 * Get the crawler for a referral program on a given hostname.
 * Checks for a program-specific crawler first, then falls back to the hostname default.
 */
export async function getCrawlerForReferralProgram(
  hostnameId: string,
  referralProgramId: string,
): Promise<Crawler> {
  if (!isUUID(hostnameId)) throw createError(422, `Invalid hostname ID: ${hostnameId}`)
  if (!isUUID(referralProgramId))
    throw createError(422, `Invalid referral program ID: ${referralProgramId}`)

  const { rows } = await read(
    `/* getCrawlerForReferralProgram */
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
    const crawler = await getCrawlerById(rows[0].id as string)
    if (crawler) return crawler
  }

  return getOrCreateCrawlerForHostname(null, hostnameId)
}

export async function getCrawlersByReferralProgramId(
  referralProgramId: string,
  options: QueryOptions = {},
): Promise<Crawler[]> {
  if (!isUUID(referralProgramId)) {
    throw createError(422, `Invalid referral program ID: ${referralProgramId}`)
  }

  const { rows } = await read(
    `/* getCrawlersByReferralProgramId */
    SELECT
      c.id,
      c.hostname_id,
      c.description,
      c.crawler_type,
      c.priority,
      c.css_selectors_to_remove,
      c.link_text_content_to_remove,
      c.link_hrefs_to_remove,
      c.content_selectors,
      c.referral_program_id,
      c.created_at,
      c.updated_at,
      c.deleted_at
    FROM crawlers c
    WHERE c.referral_program_id = $1
      AND c.deleted_at IS NULL
    ORDER BY c.priority DESC, c.id ASC
  `,
    [referralProgramId],
    options,
  )

  return rows.map(toCrawler)
}
