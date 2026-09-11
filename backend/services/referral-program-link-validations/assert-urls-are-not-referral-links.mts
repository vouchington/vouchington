import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import assert from 'http-assert'
import onError from '@modules/on-error'
import sql from 'sql-template-strings'
import { getModerationSystemUserId } from '@services/users/system-users'
import { insertVoteWeightPenalty } from '@services/vote-integrity/insert-vote-weight-penalty'
import { containsReferralLinks } from './contains-referral-links.mts'

/**
 * Throws 422 if any of the given URL IDs resolve to a URL that matches an
 * active referral-program rule. Used by `upsertEntityRelation` to keep
 * referral URLs out of related-link surfaces (post → related → url,
 * topic → related → url, etc.).
 *
 * Referral-program rules are streamed from PostgreSQL via
 * `containsReferralLinks` (cursor-based, batchSize 500) so the full rule set
 * is never loaded into memory.
 *
 * If `userId` is provided and a referral link is found, the same stacking
 * 20% vote-weight penalty as `assertUrlsHaveNoBlockedHostnames` is applied
 * to the user before throwing.
 */
export async function assertUrlsAreNotReferralLinks(
  urlIds: string[],
  userId?: string | null,
  options?: QueryOptions,
): Promise<void> {
  if (urlIds.length === 0) return

  // Stay on the writer because this runs in relation write paths and must observe
  // newly created URLs before accepting a related-link write.
  const { rows } = await write<{ url: string }>(
    sql`/* assertUrlsAreNotReferralLinks */
    SELECT url
    FROM urls
    WHERE id = ANY(${urlIds}::uuid[])
  `,
    undefined,
    options,
  )

  if (rows.length === 0) return

  const { has_referral_links } = await containsReferralLinks(
    rows.map(r => r.url),
    { ...options, readOnly: false },
  )

  if (has_referral_links && userId) {
    try {
      const moderationSystemUserId = await getModerationSystemUserId()
      await insertVoteWeightPenalty({
        userIds: [userId],
        reason: 'blocked_hostname_attempt',
        createdById: moderationSystemUserId,
      })
    } catch (err) {
      onError(err as Error)
    }
  }

  assert(!has_referral_links, 422, 'URL is a referral link and cannot be added as a related link')
}
