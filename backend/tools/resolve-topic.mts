import { getTopicByAnyCached } from '@services/entity-fetch'
import { isSlug, isUUID } from '@modules/utils'

// Topic parameters take a UUID or slug, like the REST `:idOrSlug` routes. A value that is neither
// names no topic, so it resolves to null rather than throwing.
export async function resolveTopic(idOrSlug: string) {
  const identifier = idOrSlug.trim().toLowerCase()
  return isUUID(identifier) || isSlug(identifier) ? getTopicByAnyCached(identifier) : null
}
