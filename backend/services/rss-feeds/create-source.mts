import type { BasicUser } from '@services/users/types'
import { normalizeUrlForUrlTable } from '@modules/utils/urls'
import { resolveHostname } from '@services/topics/hostname-link'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { upsertAutomaticTopicUpvote } from '@services/elections-votes/topic/automatic-upvote'
import assert from 'http-assert'
import { createRssFeedUrlId } from './rss-feed-url-id.mts'
import { buildSourceTopicName } from './validate.mts'
import { setCanonicalUrl, CircularCanonicalReferenceError } from '@services/urls/set-canonical'
import { safeResolveUrl } from '@services/crawls/crawl-url-utils'
import onError from '@modules/on-error'
import { followRssFeedRelation, createSourceWithRetry } from './create-source-helpers.mts'
import { findExistingFeedByUrlId, findExistingFeedByUrl } from './find-existing-feed.mts'
import { resolveProtocolAndClassify } from './resolve-protocol.mts'
import { assertUrlAllowedByWebRisk } from '@services/web-risk/check'
import { isPublicRssFeedUrl } from './url-validation.mts'
import type { CreateSourceOptions, CreateSourceResult } from './create-source-types.mts'
import { assertWithinFeedBudget, raceFeedBudget } from './feed-budget.mts'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'

const MAX_REDIRECT_HOPS = 5

export type { CreateSourceResult } from './create-source-types.mts'

export function createSourceFromUrl(
  currentUser: BasicUser,
  provenance: ContentProvenance,
  rssFeedUrl: string,
  options: CreateSourceOptions = {},
): Promise<CreateSourceResult> {
  return raceFeedBudget(options.signal, createSource(currentUser, provenance, rssFeedUrl, options))
}

async function createSource(
  currentUser: BasicUser,
  provenance: ContentProvenance,
  rssFeedUrl: string,
  {
    assertContributionLimit,
    follow = true,
    hopCount = 0,
    originalUrl,
    fetchAndClassifyFeedImpl,
    signal,
  }: CreateSourceOptions,
): Promise<CreateSourceResult> {
  assert(isPublicRssFeedUrl(rssFeedUrl), 422, 'rss_feed_url must be a valid URL')
  assert(hopCount <= MAX_REDIRECT_HOPS, 422, 'Too many redirects while resolving RSS feed URL')
  await assertUrlAllowedByWebRisk(rssFeedUrl, { signal })

  if (new URL(rssFeedUrl).protocol === 'http:') {
    const httpsUrl = normalizeUrlForUrlTable(rssFeedUrl).href
    const httpUrl = normalizeUrlForUrlTable(rssFeedUrl, { preserveHttp: true }).href
    const existingHttps = await findExistingFeedByUrl(httpsUrl)
    if (existingHttps) await assertUrlAllowedByWebRisk(httpsUrl, { signal })
    const existing = existingHttps ?? (await findExistingFeedByUrl(httpUrl))
    if (existing) {
      await upsertAutomaticTopicUpvote(currentUser, existing.topic_id)
      if (follow) {
        await upsertEntityRelation(currentUser, followRssFeedRelation, { id: currentUser.id }, [
          { id: existing.id },
        ]).catch(onError)
      }
      return {
        status: 'upvoted',
        rss_feed_id: existing.id,
        topic_id: existing.topic_id,
        topic_slug: existing.topic_slug,
      }
    }
  }

  // Resolve the effective URL (prefer https, fall back to http) and classify the feed
  let firstAttempt = true
  const { resolvedUrl, classification } = await resolveProtocolAndClassify(rssFeedUrl, {
    beforeFetch: url => {
      const alreadyChecked = firstAttempt && url === rssFeedUrl
      firstAttempt = false
      // Reuse only this attempt's initial proof; protocol fallback and later hops revalidate.
      return alreadyChecked ? Promise.resolve() : assertUrlAllowedByWebRisk(url, { signal })
    },
    fetchAndClassifyFeedImpl,
    signal,
  })
  await assertUrlAllowedByWebRisk(resolvedUrl, { signal })
  const isHttpUrl = new URL(resolvedUrl).protocol === 'http:'

  if (classification.kind === 'redirect') {
    const resolvedRedirectUrl = safeResolveUrl(classification.location, resolvedUrl)
    assert(resolvedRedirectUrl, 422, 'RSS feed URL returned an unparseable redirect location')
    assert(resolvedRedirectUrl !== resolvedUrl, 422, 'RSS feed URL redirects to itself')

    // For permanent redirects: record the canonical URL mapping so future uploads of the
    // pre-redirect URL resolve here automatically.
    if (classification.isPermanent) {
      const originalRssFeedUrl = originalUrl ?? rssFeedUrl
      const originalUrlId = await createRssFeedUrlId(originalRssFeedUrl, {
        preserveHttp: new URL(originalRssFeedUrl).protocol === 'http:',
      })
      const resolvedUrlId = await createRssFeedUrlId(resolvedRedirectUrl, {
        preserveHttp: new URL(resolvedRedirectUrl).protocol === 'http:',
      })
      setCanonicalUrl(originalUrlId, resolvedUrlId).catch(err => {
        if (!(err instanceof CircularCanonicalReferenceError))
          onError(err instanceof Error ? err : new Error(String(err)))
      })
    }

    return createSource(currentUser, provenance, resolvedRedirectUrl, {
      assertContributionLimit,
      follow,
      hopCount: hopCount + 1,
      originalUrl: originalUrl ?? rssFeedUrl,
      fetchAndClassifyFeedImpl,
      signal,
    })
  }

  const { title: feedTitle, feedType } = classification

  // Normalize for consistent naming/slugging relative to the stored URL.
  const normalizedUrl = normalizeUrlForUrlTable(resolvedUrl, { preserveHttp: isHttpUrl })
  const normalizedFeedUrl = normalizedUrl.href
  const rawHostname = normalizedUrl.hostname
  const rawTitle = feedTitle ?? rawHostname
  const topicName = buildSourceTopicName(rawTitle, normalizedFeedUrl)

  const existing = await findExistingFeedByUrl(normalizedFeedUrl)
  if (existing) {
    await upsertAutomaticTopicUpvote(currentUser, existing.topic_id)
    if (follow) {
      await upsertEntityRelation(currentUser, followRssFeedRelation, { id: currentUser.id }, [
        { id: existing.id },
      ]).catch(onError)
    }
    return {
      status: 'upvoted',
      rss_feed_id: existing.id,
      topic_id: existing.topic_id,
      topic_slug: existing.topic_slug,
    }
  }

  // The budget is checked before the writes: an aborted call must not create a source that the
  // retried job then races against.
  assertWithinFeedBudget(signal)
  // ast-grep-ignore: no-three-sequential-awaits -- service workflow has dependent validation, mutation, and follow-up side effects
  await assertContributionLimit?.()
  assertWithinFeedBudget(signal)

  const rssFeedUrlId = await createRssFeedUrlId(resolvedUrl, { preserveHttp: isHttpUrl })
  const hostnameId = await resolveHostname(currentUser.id, rawHostname)
  assert(hostnameId, 500, 'Failed to resolve hostname')

  // Attempt creation with up to 3 retries; null means a URL race condition was detected.
  const created = await createSourceWithRetry({
    provenance,
    currentUser,
    rssFeedUrlId,
    hostnameId,
    feedUrl: normalizedFeedUrl,
    topicName,
    rawTitle,
    feedTitle,
    feedType,
    attempt: 0,
  })

  if (!created) {
    // Race condition: another request created this URL concurrently — switch to upvote path.
    const raceExisting = await findExistingFeedByUrlId(rssFeedUrlId)
    assert(raceExisting, 500, 'Concurrent source creation race condition')
    await upsertAutomaticTopicUpvote(currentUser, raceExisting.topic_id)
    if (follow) {
      await upsertEntityRelation(currentUser, followRssFeedRelation, { id: currentUser.id }, [
        { id: raceExisting.id },
      ]).catch(onError)
    }
    return {
      status: 'upvoted',
      rss_feed_id: raceExisting.id,
      topic_id: raceExisting.topic_id,
      topic_slug: raceExisting.topic_slug,
    }
  }

  const { topicId, rssFeedId, slug } = created

  upsertAutomaticTopicUpvote(currentUser, topicId).catch(onError)

  if (follow) {
    await upsertEntityRelation(currentUser, followRssFeedRelation, { id: currentUser.id }, [
      { id: rssFeedId },
    ]).catch(onError)
  }

  return { status: 'created', rss_feed_id: rssFeedId, topic_id: topicId, topic_slug: slug }
}
