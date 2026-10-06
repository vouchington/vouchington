import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import {
  mapProvenanceFacts,
  type ProvenanceFacts,
  type ProvenanceFactsRow,
} from './provenance-facts.mts'

export type PostProvenanceFacts = ProvenanceFacts

/**
 * Reads the creation channel and the OAuth client for already-visible post ids in one query.
 * The columns stay out of the cached post and every view, so a verification change or a rename
 * shows on the next response instead of waiting for a cache refresh.
 */
export async function getPostProvenanceFacts(
  postIds: string[],
  options: QueryOptions = {},
): Promise<Map<string, PostProvenanceFacts>> {
  if (postIds.length === 0) return new Map()
  const { rows } = await read<ProvenanceFactsRow>(
    `/* getPostProvenanceFacts */
    SELECT p.id, p.created_via, c.client_id, c.client_name, c.metadata_url, c.verified_at
    FROM posts p
    LEFT JOIN oauth_clients c ON c.id = p.created_via_oauth_client_id
    WHERE p.id = ANY($1::uuid[])`,
    [postIds],
    options,
  )
  return mapProvenanceFacts(rows)
}
