import type { searchCommunityListItems } from '@services/communities'
import { indexById } from '@modules/utils'

type Indexable = { id: string }

type ListItemsOutputOptions = {
  /** The response key of the entity map, such as `posts`. Its metrics map is `<name>_metrics`. */
  name: string
  /** The entities of the page, read from the cache and labeled for the viewer. */
  getEntities: (ids: string[]) => Promise<(Indexable | null)[]>
  getMetrics: (ids: string[]) => Promise<(Indexable | null)[]>
}

function indexPresent(entries: (Indexable | null)[]): Record<string, unknown> {
  return entries.reduce<Record<string, unknown>>((acc, entry) => {
    if (entry) acc[entry.id] = entry
    return acc
  }, {})
}

/**
 * Builds the streamed body of one page of community list items: the page, the list items and the
 * entity and metrics maps of its entries. The maps stay promises so the stream starts before the
 * cache reads settle. Each route writes the response itself, because the contract catalog
 * attributes a response to the route that sends it.
 */
export function buildCommunityListItemsOutput(
  result: Awaited<ReturnType<typeof searchCommunityListItems>>,
  { name, getEntities, getMetrics }: ListItemsOutputOptions,
): Record<string, unknown> {
  const entityIds = result.results.map(item => item.entity_id)
  return {
    results: result.results.map(item => ({
      __entity_type: 'community_list_item' as const,
      id: item.id,
    })),
    page_info: result.page_info,
    community_list_items: indexById(result.results),
    [name]: getEntities(entityIds).then(indexPresent),
    [`${name}_metrics`]: getMetrics(entityIds).then(indexPresent),
  }
}
