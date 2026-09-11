import type { TransactionQuery } from '@data-stores/psql'
import { retainPostPublicationKeys, type PostPublicationRetainedKey } from './capture-keys.mts'
import type { PublicationProjectionIdentity } from './projection-identity.mts'

/** Retains the last applied identities so shadow repair compensates removed projections exactly. */
export async function retainAppliedProjectionIdentity(
  query: TransactionQuery,
  dirtyWorkId: string,
  identity: PublicationProjectionIdentity | null,
): Promise<void> {
  if (!identity) return
  const keys: PostPublicationRetainedKey[] = [
    ...identity.topicIds.map(uuidValue => ({ kind: 'impact_topic' as const, uuidValue })),
    ...identity.identityKeys.flatMap(toDirtyWorkIdentityKey),
    ...identity.sitemapTargets.map(({ postType, day }) => ({
      kind: 'sitemap_target' as const,
      postType,
      day,
    })),
  ]
  if (keys.length === 0) return
  await retainPostPublicationKeys(query, dirtyWorkId, keys)
}

function toDirtyWorkIdentityKey(key: {
  kind: string
  value: string
}): PostPublicationRetainedKey[] {
  switch (key.kind) {
    case 'author':
      return [
        isUuid(key.value)
          ? { kind: 'identity_author', uuidValue: key.value }
          : { kind: 'identity_author_username', textValue: key.value },
      ]
    case 'community':
      return [{ kind: 'identity_community', uuidValue: key.value }]
    case 'community_slug':
      return [{ kind: 'identity_community_slug', textValue: key.value }]
    case 'post_slug':
      return [{ kind: 'identity_post_slug', textValue: key.value }]
    case 'rss_feed':
      return [{ kind: 'identity_rss_feed', uuidValue: key.value }]
    default:
      throw new TypeError(`Unsupported post publication identity key: ${key.kind}`)
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
