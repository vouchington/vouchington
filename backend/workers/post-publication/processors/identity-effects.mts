import {
  invalidateCommunityStrict,
  invalidatePostStrict,
  invalidateRssFeedStrict,
  invalidateUserStrict,
} from '@services/entity-cache/invalidate-strict'

export type PublicationIdentityEffectDependencies = {
  invalidatePost: typeof invalidatePostStrict
  invalidateUser: typeof invalidateUserStrict
  invalidateCommunity: typeof invalidateCommunityStrict
  invalidateRssFeed: typeof invalidateRssFeedStrict
  invalidateTopic: (...keys: string[]) => Promise<void>
}

/** Applies retained identity invalidations strictly so work remains retryable on any cache failure. */
export async function applyPostPublicationIdentityEffects(
  keys: Array<{ kind: string; value: string }>,
  deps: PublicationIdentityEffectDependencies,
): Promise<void> {
  const identities = groupPostPublicationIdentityKeys(keys)
  await Promise.all([
    invalidateIfPresent(identities.authors, deps.invalidateUser),
    invalidateIfPresent(identities.communities, deps.invalidateCommunity),
    invalidateIfPresent(identities.rssFeeds, deps.invalidateRssFeed),
    invalidateIfPresent(identities.postSlugs, deps.invalidatePost),
    invalidateIfPresent(identities.topicAliases, deps.invalidateTopic),
  ])
}

function groupPostPublicationIdentityKeys(keys: Array<{ kind: string; value: string }>) {
  const identities = {
    authors: new Set<string>(),
    communities: new Set<string>(),
    rssFeeds: new Set<string>(),
    postSlugs: new Set<string>(),
    topicAliases: new Set<string>(),
  }
  for (const key of keys) {
    switch (key.kind) {
      case 'author':
        identities.authors.add(key.value)
        break
      case 'community':
      case 'community_slug':
        identities.communities.add(key.value)
        break
      case 'rss_feed':
        identities.rssFeeds.add(key.value)
        break
      case 'post_slug':
        identities.postSlugs.add(key.value)
        break
      case 'topic_alias':
        identities.topicAliases.add(key.value)
        break
      default:
        throw new TypeError(`Unsupported publication identity kind: ${key.kind}`)
    }
  }
  return identities
}

function invalidateIfPresent(
  identities: Set<string>,
  invalidate: (...keys: string[]) => Promise<void>,
): Promise<void> | undefined {
  if (identities.size === 0) return undefined
  return invalidate(...identities)
}
