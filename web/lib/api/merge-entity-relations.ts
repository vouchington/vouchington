import type { EntityRelationsResponse } from './entity-relations'

export function mergeEntityRelationPages(
  pages: EntityRelationsResponse[],
): EntityRelationsResponse {
  const first = pages[0]!
  const last = pages.at(-1)!
  return {
    ...first,
    results: pages.flatMap(page => page.results),
    page_info: last.page_info,
    entity_relations: Object.assign({}, ...pages.map(page => page.entity_relations)),
    entity_relation_elections: Object.assign(
      {},
      ...pages.map(page => page.entity_relation_elections ?? {}),
    ),
    election_votes: Object.assign({}, ...pages.map(page => page.election_votes ?? {})),
  }
}
