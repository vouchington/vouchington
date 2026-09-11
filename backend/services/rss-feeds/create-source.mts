import type { BasicUser } from '@services/users/types'
import { normalizeUrlForUrlTable } from '@modules/utils/urls'
import { resolveHostname } from '@services/topics/hostname-link'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { upsertTopicElectionVotes } from '@services/elections-votes/topic/votes-upsert'
import assert from 'http-assert'
import { createRssFeedUrlId } from './rss-feed-url-id.mts'
import { buildSourceTopicName, type FeedClassification } from './validate.mts'
import { setCanonicalUrl, CircularCanonicalReferenceError } from '@services/urls/set-canonical'
import { safeResolveUrl } from '@services/crawls/crawl-url-utils'
import onError from '@modules/on-error'
import { followRssFeedRelation, createSourceWithRetry } from './create-source-helpers.mts'
import { findExistingFeedByUrlId, findExistingFeedByUrl } from './find-existing-feed.mts'
import { resolveProtocolAndClassify } from './resolve-protocol.mts'
import { assertUrlAllowedByWebRisk } from '@services/web-risk/check'
import { isPublicRssFeedUrl } from './url-validation.mts'

const MAX_REDIRECT_HOPS = 5

export type CreateSourceResult = {
  status: 'created' | 'upvoted'
  rss_feed_id: string
  topic_id: string
  topic_slug: string
}

type CreateSourceOptions = {
  assertContributionLimit?: () => Promise<void>
  follow?: boolean
  hopCount?: number
  originalUrl?: string
  fetchAndClassifyFeedImpl?: (rssFeedUrl: string) => Promise<FeedClassification>
}

export async function createSourceFromUrl(
  currentUser: BasicUser,
  rssFeedUrl: string,
  {
    assertContributionLimit,
    follow = true,
    hopCount = 0,
    originalUrl,
    fetchAndClassifyFeedImpl,
  }: CreateSourceOptions = {},
): Promise<CreateSourceResult> {
  assert(isPublicRssFeedUrl(rssFeedUrl), 422, 'rss_feed_url must be a valid URL')
  assert(hopCount <= MAX_REDIRECT_HOPS, 422, 'Too many redirects while resolving RSS feed URL')
  await assertUrlAllowedByWebRisk(rssFeedUrl)

  if (new URL(rssFeedUrl).protocol === 'http:') {
    const httpsUrl = normalizeUrlForUrlTable(rssFeedUrl).href
    const httpUrl = normalizeUrlForUrlTable(rssFeedUrl, { preserveHttp: true }).href
    const existingHttps = await findExistingFeedByUrl(httpsUrl)
    if (existingHttps) await assertUrlAllowedByWebRisk(httpsUrl)
    const existing = existingHttps ?? (await findExistingFeedByUrl(httpUrl))
    if (existing) {
      await upsertTopicElectionVotes(currentUser.id, [{ entityId: existing.topic_id, score: 1 }])
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
  const { resolvedUrl, classification } = await resolveProtocolAndClassify(rssFeedUrl, {
    beforeFetch: assertUrlAllowedByWebRisk,
    fetchAndClassifyFeedImpl,
  })
  await assertUrlAllowedByWebRisk(resolvedUrl)
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
      setCanonicalUrl(originalUrlId, resolvedUrlId).catch(error => {
        if (!(error instanceof CircularCanonicalReferenceError))
          onError(error instanceof Error ? error : new Error(String(error)))
      })
    }

    return createSourceFromUrl(currentUser, resolvedRedirectUrl, {
      assertContributionLimit,
      follow,
      hopCount: hopCount + 1,
      originalUrl: originalUrl ?? rssFeedUrl,
      fetchAndClassifyFeedImpl,
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
    await upsertTopicElectionVotes(currentUser.id, [{ entityId: existing.topic_id, score: 1 }])
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

  // ast-grep-ignore: no-three-sequential-awaits -- service workflow has dependent validation, mutation, and follow-up side effects
  await assertContributionLimit?.()

  const rssFeedUrlId = await createRssFeedUrlId(resolvedUrl, { preserveHttp: isHttpUrl })
  const hostnameId = await resolveHostname(currentUser.id, rawHostname)
  assert(hostnameId, 500, 'Failed to resolve hostname')

  // Attempt creation with up to 3 retries; null means a URL race condition was detected.
  const created = await createSourceWithRetry({
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
    await upsertTopicElectionVotes(currentUser.id, [{ entityId: raceExisting.topic_id, score: 1 }])
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

  upsertTopicElectionVotes(currentUser.id, [{ entityId: topicId, score: 1 }]).catch(onError)

  if (follow) {
    await upsertEntityRelation(currentUser, followRssFeedRelation, { id: currentUser.id }, [
      { id: rssFeedId },
    ]).catch(onError)
  }

  return { status: 'created', rss_feed_id: rssFeedId, topic_id: topicId, topic_slug: slug }
}
