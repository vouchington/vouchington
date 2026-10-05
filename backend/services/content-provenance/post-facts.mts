import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { ContentCreationChannel } from '@voucha/types/entities/content-provenance'
import type { ProvenanceClient } from './resolve-public-provenance-label.mts'

export type PostProvenanceFacts = {
  created_via: ContentCreationChannel
  client: ProvenanceClient | null
}

type FactsRow = {
  id: string
  created_via: ContentCreationChannel
  client_id: string | null
  client_name: string | null
  metadata_url: string | null
  verified_at: Date | null
}

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
  const { rows } = await read<FactsRow>(
    `/* getPostProvenanceFacts */
    SELECT p.id, p.created_via, c.client_id, c.client_name, c.metadata_url, c.verified_at
    FROM posts p
    LEFT JOIN oauth_clients c ON c.id = p.created_via_oauth_client_id
    WHERE p.id = ANY($1::uuid[])`,
    [postIds],
    options,
  )
  return new Map(
    rows.map(row => [
      row.id,
      {
        created_via: row.created_via,
        client:
          row.client_id === null
            ? null
            : {
                client_id: row.client_id,
                client_name: row.client_name!,
                metadata_url: row.metadata_url,
                verified_at: row.verified_at,
              },
      },
    ]),
  )
}
