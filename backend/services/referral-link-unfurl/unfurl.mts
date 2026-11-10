import { assessUrls } from '@services/urls/upsert'
import { prepareUrlHostnamesForOwnedMutation } from '@services/urls-hostnames/upsert'
import { lockHostnameOwnership } from '@services/urls-hostnames/ownership-lock'
import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import onError from '@modules/on-error'
import { getMembershipByUserId } from '@services/memberships'
import { hasPlusTier } from '@modules/membership-helpers'
import { getUrlById } from '@services/urls/get'
import { crawlWithBrowser } from '@services/browser-crawl'
import { validateReferralLinkUrls } from '@services/referral-program-link-validations'
import {
  getUserReferralLink,
  createChildReferralLinks,
  reconcileChildrenForParent,
  markReferralLinkUnfurlCompleted,
  markReferralLinkUnfurlFailed,
} from '@services/user-referral-program-links'
import { getAmexCardSlugCatalog, constructChildUrls } from './construct-amex-children.mts'
import { clearPrioritizedLinksCache } from '@services/user-referral-program-links/prioritized-links-cache'
import { SYSTEM_PROVENANCE } from '@voucha/types/entities/content-provenance'

/** Retained call site. Parent unfurls no longer take an advisory lock. */
async function lockParentForUnfurl(
  _parentLinkId: string,
  _query: TransactionQuery,
): Promise<void> {}

/**
 * Idempotent unfurl processor body (queue-authoring rule: every retry must be safe). Re-crawls
 * the parent, re-constructs children from the current catalog, upserts them by the existing
 * (user, program, url) unique index, and reconciles away any card Amex dropped since the last
 * run. Re-running is also the primary freshness mechanism for Amex's rotating CORID/GENCODE
 * tokens (see plan § Idempotency / self-heal) -- the health-check crawler is only a weak
 * backstop for that.
 */
export async function runReferralLinkUnfurl(parentLinkId: string): Promise<void> {
  const parent = await getUserReferralLink(parentLinkId)
  // Missing/deleted, or itself a child (should never be enqueued, but tolerate a stale job) --
  // nothing to do, no error.
  if (!parent || parent.parent_link_id) return

  const membership = await getMembershipByUserId(parent.user_id)
  if (!hasPlusTier(membership)) {
    await markReferralLinkUnfurlFailed(
      parentLinkId,
      'Owner no longer has an active Plus/Pro membership',
    )
    return
  }

  const parentUrl = await getUrlById(parent.url_id)
  if (!parentUrl) {
    await markReferralLinkUnfurlFailed(parentLinkId, 'Referral link URL record is missing')
    return
  }

  let finalUrl: string
  try {
    // Single crawl of the parent's URL. The captured param set is used to construct BOTH
    // personal and business child URLs (see plan § Empirical verification) -- whether the
    // personal landed page's params also authorize business URLs, or a separate crawl of the
    // business landed page is needed, is an unverified build-time assumption tracked in
    // Follow-ups; the validation below gates every constructed URL regardless, so
    // constructing business children from the same params is structurally safe either way.
    const crawlResult = await crawlWithBrowser(parentUrl.url)
    finalUrl = crawlResult.finalUrl
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    onError(error)
    await markReferralLinkUnfurlFailed(parentLinkId, `Crawl failed: ${error.message}`)
    throw error // retryable -- let the queue's attempts/backoff retry the crawl
  }

  let validCandidates: Array<{ url: string; referralProgramId: string }>
  try {
    const catalog = await getAmexCardSlugCatalog()
    const candidateUrls = constructChildUrls(finalUrl, catalog)
    // Load the ordered enabled-rule catalog once before opening the write transaction.
    const validations = await validateReferralLinkUrls(candidateUrls)

    validCandidates = []
    for (const [index, url] of candidateUrls.entries()) {
      const validation = validations[index]!
      if (validation.is_valid && validation.referral_program_id) {
        validCandidates.push({ url, referralProgramId: validation.referral_program_id })
      }
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    onError(error)
    await markReferralLinkUnfurlFailed(
      parentLinkId,
      `Failed to construct child URLs: ${error.message}`,
    )
    return
  }

  const assessedUrls = await assessUrls(validCandidates.map(candidate => candidate.url))
  await using query = await beginTransaction()
  // ast-grep-ignore: no-three-sequential-awaits -- Resolved hostname ids select ownership locks; those locks must precede the referral parent row lock before replacing child links.
  const resolved = await prepareUrlHostnamesForOwnedMutation(
    parent.user_id,
    assessedUrls.map(url => url.hostname),
    query,
  )
  await lockHostnameOwnership(query, [...resolved.values()])
  await lockParentForUnfurl(parentLinkId, query)
  const children = await createChildReferralLinks(
    parent.user_id,
    SYSTEM_PROVENANCE,
    validCandidates.map(candidate => ({
      userId: parent.user_id,
      referralProgramId: candidate.referralProgramId,
      url: candidate.url,
      parentLinkId,
    })),
    { query, assessedUrls },
  )
  const keptUrlIds = children.map(child => child.url_id)

  // A dropped child can sit in a program no current candidate resolves to; clear that one too.
  const droppedProgramIds =
    keptUrlIds.length > 0
      ? await reconcileChildrenForParent(parentLinkId, keptUrlIds, { query })
      : []
  await query.commit()
  await clearPrioritizedLinksCache([
    ...new Set([
      ...validCandidates.map(candidate => candidate.referralProgramId),
      ...droppedProgramIds,
    ]),
  ])

  if (keptUrlIds.length === 0) {
    // Graceful zero-child completion (URL-shape drift, bot-blocking, every candidate already
    // hijacked) -- the parent is left untouched, not deleted or deactivated.
    await markReferralLinkUnfurlFailed(
      parentLinkId,
      'No per-card referral URLs resolved from the crawled page',
    )
    return
  }

  await markReferralLinkUnfurlCompleted(parentLinkId)
}
