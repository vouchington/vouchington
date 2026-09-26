import { getTopicByAnyCached, getTopicByAnyCachedBatch } from '@services/entity-fetch'
import { isSlug, isUUID } from '@modules/utils'

// Topic parameters take a UUID or slug, like the REST `:idOrSlug` routes. A value that is neither
// names no topic, so it resolves to null rather than throwing.
export async function resolveTopic(idOrSlug: string) {
  const identifier = toTopicIdentifier(idOrSlug)
  return identifier ? getTopicByAnyCached(identifier) : null
}

// Resolves several topic parameters in input order with one batched cache lookup.
export async function resolveTopics(idsOrSlugs: string[]) {
  const identifiers = idsOrSlugs.map(toTopicIdentifier)
  const lookups = identifiers.filter(identifier => identifier != null)
  const topics = lookups.length > 0 ? await getTopicByAnyCachedBatch(lookups) : []
  const byIdentifier = new Map(lookups.map((identifier, index) => [identifier, topics[index]]))
  return identifiers.map(identifier => (identifier ? (byIdentifier.get(identifier) ?? null) : null))
}

function toTopicIdentifier(idOrSlug: string) {
  const identifier = idOrSlug.trim().toLowerCase()
  return isUUID(identifier) || isSlug(identifier) ? identifier : null
}
