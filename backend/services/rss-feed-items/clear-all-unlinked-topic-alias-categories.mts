import type { QueryOptions } from '@data-stores/psql/types'
import { clearUnlinkedTopicAliasCategories } from './clear-unlinked-topic-alias-categories.mts'

/**
 * Clears every topic mapping retained by an alias that is now standalone or deleted. The linked
 * owner check makes this safe when a newer alias transition races this recovery work.
 */
export async function clearAllCategoriesForUnlinkedTopicAlias(
  topicAliasId: string,
  alias: string,
  options: QueryOptions = {},
): Promise<{ updated: number }> {
  return clearUnlinkedTopicAliasCategories(topicAliasId, alias, undefined, options)
}
