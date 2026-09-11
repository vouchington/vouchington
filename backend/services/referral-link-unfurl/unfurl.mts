import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { isHttpError } from 'http-errors'
import onError from '@modules/on-error'
import { getMembershipByUserId } from '@services/memberships'
import { hasPlusTier } from '@modules/membership-helpers'
import { getUrlById } from '@services/urls/get'
import { crawlWithBrowser } from '@services/browser-crawl'
import { isUrlReferralLink } from '@services/referral-program-link-validations'
import {
  getUserReferralLink,
  createChildReferralLink,
  reconcileChildrenForParent,
  markReferralLinkUnfurlCompleted,
  markReferralLinkUnfurlFailed,
} from '@services/user-referral-program-links'
import { getAmexCardSlugCatalog, constructChildUrls } from './construct-amex-children.mts'

type ReferralLinkUnfurlDependencies = {
  crawlWithBrowser?: typeof crawlWithBrowser
  getAmexCardSlugCatalog?: typeof getAmexCardSlugCatalog
}

/** Serializes concurrent unfurls of the same parent so their reconcile passes can't race. */
async function lockParentForUnfurl(parentLinkId: string, query: TransactionQuery): Promise<void> {
  await query(sql`/* lockParentForUnfurl */
    SELECT pg_advisory_xact_lock(hashtextextended(${parentLinkId}, 0))
  `)
}

/**
 * Idempotent unfurl processor body (queue-authoring rule: every retry must be safe). Re-crawls
 * the parent, re-constructs children from the current catalog, upserts them by the existing
 * (user, program, url) unique index, and reconciles away any card Amex dropped since the last
 * run. Re-running is also the primary freshness mechanism for Amex's rotating CORID/GENCODE
 * tokens (see plan § Idempotency / self-heal) -- the health-check crawler is only a weak
 * backstop for that.
 *
 * `dependencies.crawlWithBrowser` mirrors the injection seam in
 * `backend/workers/crawl-browser/processors.mts` -- it lets tests exercise the full
 * construct/validate/create/reconcile flow against a fixture `finalUrl` without a real browser,
 * without mocking the `@services/browser-crawl` module. `dependencies.getAmexCardSlugCatalog`
 * is the same pattern applied to the seeded catalog -- it lets a reconcile test simulate Amex
 * dropping a card between two runs without mutating the shared, dirty-database seed rows that
 * `construct-amex-children.test.mts` asserts a fixed count against.
 */
export async function runReferralLinkUnfurl(
  parentLinkId: string,
  dependencies?: ReferralLinkUnfurlDependencies,
): Promise<void> {
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
    // Follow-ups; isUrlReferralLink below gates every constructed URL regardless, so
    // constructing business children from the same params is structurally safe either way.
    const doCrawlWithBrowser = dependencies?.crawlWithBrowser ?? crawlWithBrowser
    const crawlResult = await doCrawlWithBrowser(parentUrl.url)
    finalUrl = crawlResult.finalUrl
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    onError(error)
    await markReferralLinkUnfurlFailed(parentLinkId, `Crawl failed: ${error.message}`)
    throw error // retryable -- let the queue's attempts/backoff retry the crawl
  }

  let validCandidates: Array<{ url: string; referralProgramId: string }>
  try {
    const doGetAmexCardSlugCatalog = dependencies?.getAmexCardSlugCatalog ?? getAmexCardSlugCatalog
    const catalog = await doGetAmexCardSlugCatalog()
    const candidateUrls = constructChildUrls(finalUrl, catalog)

    validCandidates = []
    for (const url of candidateUrls) {
      // Read-only validation, run before opening the write transaction below so the
      // connection isn't held open for the duration of these checks.
      // oxlint-disable-next-line no-await-in-loop
      const validation = await isUrlReferralLink(url)
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

  const keptUrlIds: string[] = []
  await using query = await beginTransaction()
  await lockParentForUnfurl(parentLinkId, query)

  for (const { url, referralProgramId } of validCandidates) {
    try {
      // Every createChildReferralLink call shares the single transaction connection (`query`);
      // concurrent writes on one PG client are unsafe, so these must stay sequential.
      // oxlint-disable-next-line no-await-in-loop
      const child = await createChildReferralLink(
        parent.user_id,
        {
          userId: parent.user_id,
          referralProgramId,
          url,
          parentLinkId,
        },
        { query },
      )
      keptUrlIds.push(child.url_id)
    } catch (err) {
      // The URL already exists as a manually-added link -- skip this one card rather than
      // aborting the whole unfurl.
      if (isHttpError(err) && err.status === 409) continue
      throw err
    }
  }

  if (keptUrlIds.length > 0) {
    await reconcileChildrenForParent(parentLinkId, keptUrlIds, { query })
  }
  await query.commit()

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
