import { isUUID } from '@modules/utils'
import { getCommunitiesByReferenceBatch } from '@services/communities/resolve-references'
import { getUsersByReferenceBatch } from '@services/users/resolve-references'
import { resolvePosts } from './resolve-post.mts'
import { resolveRssFeeds } from './resolve-rss-feed.mts'
import { resolveTopics } from './resolve-topic.mts'

type ResolvedReference = { id: string; slug: string | null }

/**
 * Resolves one entity type's references. Types other than topic, post, RSS feed, community
 * and user stay id-only: a UUID passes through and anything else is missing.
 */
export async function resolveTypedReferences(
  entityType: string,
  references: readonly string[],
): Promise<Array<ResolvedReference | null>> {
  if (entityType === 'topic') {
    return (await resolveTopics(references)).map(topic =>
      topic ? { id: topic.id, slug: topic.slug } : null,
    )
  }
  if (entityType === 'post') {
    return (await resolvePosts(references)).map(post =>
      post ? { id: post.id, slug: post.slug ?? null } : null,
    )
  }
  if (entityType === 'rss_feed') return resolveRssFeeds(references)
  if (entityType === 'community') return getCommunitiesByReferenceBatch(references)
  if (entityType === 'user') {
    return (await getUsersByReferenceBatch(references)).map(user =>
      user ? { id: user.id, slug: null } : null,
    )
  }
  return references.map(reference => {
    const trimmed = reference.trim()
    return isUUID(trimmed) ? { id: trimmed, slug: null } : null
  })
}

export async function resolveTypedReference(
  entityType: string,
  reference: string,
): Promise<ResolvedReference | null> {
  const [resolved] = await resolveTypedReferences(entityType, [reference])
  return resolved ?? null
}

/** One id per reference, in order. An unknown UUID is unchanged. Anything else unknown is null. */
export async function canonicalEntityIds(
  entityType: string,
  references: readonly string[],
): Promise<Array<string | null>> {
  const resolved = await resolveTypedReferences(entityType, references)
  return references.map((reference, index) => {
    if (resolved[index]) return resolved[index].id
    const trimmed = reference.trim()
    return isUUID(trimmed) ? trimmed : null
  })
}

/**
 * The id to pass to an existing guard. A reference that resolves uses that id, including a
 * merged topic's destination. A UUID that does not resolve is unchanged so a later guard can
 * answer not found. Anything else that does not resolve is missing.
 */
export async function canonicalEntityId(
  entityType: string,
  reference: string,
): Promise<string | null> {
  const [id] = await canonicalEntityIds(entityType, [reference])
  return id ?? null
}

/** Stand-in id for a natural key that did not resolve, so the existing guard answers as it does for a missing id. */
export const MISSING_REFERENCE_ID = '00000000-0000-4000-8000-000000000000'

export async function entityIdOrMissing(entityType: string, reference: string): Promise<string> {
  return (await canonicalEntityId(entityType, reference)) ?? MISSING_REFERENCE_ID
}

/** One lookup per entity type for the named fields present on the arguments. */
export async function resolveReferenceFields(
  args: Record<string, unknown>,
  fields: Readonly<Record<string, string>>,
): Promise<void> {
  const keysByType = new Map<string, string[]>()
  for (const [key, entityType] of Object.entries(fields)) {
    if (typeof args[key] !== 'string') continue
    const keys = keysByType.get(entityType) ?? []
    keys.push(key)
    keysByType.set(entityType, keys)
  }
  await Promise.all(
    [...keysByType].map(async ([entityType, keys]) => {
      // no-mistakes-disable-next-line query-reached-per-item: one lookup statement per entity type
      const ids = await canonicalEntityIds(
        entityType,
        keys.map(key => args[key] as string),
      )
      for (const [index, key] of keys.entries()) args[key] = ids[index] ?? MISSING_REFERENCE_ID
    }),
  )
}
