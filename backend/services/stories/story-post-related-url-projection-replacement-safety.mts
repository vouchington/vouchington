import type { TransactionQuery } from '@data-stores/psql/types'
import { relationLimitsMaxValues } from '@services/entity-relations/relation-limits-config'
import { containsReferralLinks } from '@services/referral-program-link-validations/contains-referral-links'
import {
  lockProjectionEligibilityAndFindBlockedUrls,
  findBlockedStoryPostRelatedUrlProjectionUrls,
} from './story-post-related-url-projection-relation-safety.mts'

type ProjectionSafetyUrl = { url_id: string; url: string }

/** Include active URLs from every source page before the hostname and post fences are taken. */
export async function getStoryPostRelatedUrlProjectionActiveUrls(
  query: TransactionQuery,
  postId: string,
): Promise<ProjectionSafetyUrl[]> {
  const { rows } = await query<ProjectionSafetyUrl>(
    `/* getStoryPostRelatedUrlProjectionActiveUrls */
      WITH active_urls AS MATERIALIZED (
        SELECT object_id FROM relation__post__related__url
        WHERE subject_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC, object_id DESC LIMIT $2
      )
      SELECT active_urls.object_id AS url_id, urls.url
      FROM active_urls CROSS JOIN LATERAL (
        SELECT url FROM urls WHERE id = active_urls.object_id LIMIT 1
      ) urls`,
    [postId, relationLimitsMaxValues.post_related_url],
  )
  return rows
}

/** Lock the current page only; a concurrent block of another active URL is caught next generation. */
export async function findUnsafeStoryPostRelatedUrlProjectionUrls(
  query: TransactionQuery,
  postId: string,
  sourceRows: readonly ProjectionSafetyUrl[],
): Promise<Set<string>> {
  const activeUrls = await getStoryPostRelatedUrlProjectionActiveUrls(query, postId)
  const urls = new Map<string, string>()
  for (const row of [...activeUrls, ...sourceRows]) urls.set(row.url_id, row.url)
  const unsafeUrlIds = await lockProjectionEligibilityAndFindBlockedUrls(
    query,
    sourceRows.map(row => row.url_id),
  )
  const blockedActiveUrlIds = await findBlockedStoryPostRelatedUrlProjectionUrls(
    query,
    activeUrls.map(row => row.url_id),
  )
  for (const urlId of blockedActiveUrlIds) unsafeUrlIds.add(urlId)
  const { matched_urls: matches } = await containsReferralLinks([...urls.values()], { query })
  const referralUrls = new Set(matches.map(match => match.url))
  for (const [urlId, url] of urls) {
    if (referralUrls.has(url)) unsafeUrlIds.add(urlId)
  }
  return unsafeUrlIds
}
