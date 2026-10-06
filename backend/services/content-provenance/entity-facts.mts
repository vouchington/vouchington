import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import {
  mapProvenanceFacts,
  type ProvenanceFacts,
  type ProvenanceFactsRow,
} from './provenance-facts.mts'

type FactsByEntityId = Map<string, ProvenanceFacts>

// One statement per table, each a literal so the SQL tooling can read it. The columns stay out of
// the cached entities and every view, so a verification change or a rename shows on the next
// response instead of waiting for a cache refresh.

/** The creation channel and OAuth client of already-visible communities, in one query. */
export async function getCommunityProvenanceFacts(
  communityIds: string[],
  options: QueryOptions = {},
): Promise<FactsByEntityId> {
  if (communityIds.length === 0) return new Map()
  const { rows } = await read<ProvenanceFactsRow>(
    `/* getCommunityProvenanceFacts */
    SELECT e.id, e.created_via, c.client_id, c.client_name, c.metadata_url, c.verified_at
    FROM communities e
    LEFT JOIN oauth_clients c ON c.id = e.created_via_oauth_client_id
    WHERE e.id = ANY($1::uuid[])`,
    [communityIds],
    options,
  )
  return mapProvenanceFacts(rows)
}

/** The creation channel and OAuth client of already-visible topics, in one query. */
export async function getTopicProvenanceFacts(
  topicIds: string[],
  options: QueryOptions = {},
): Promise<FactsByEntityId> {
  if (topicIds.length === 0) return new Map()
  const { rows } = await read<ProvenanceFactsRow>(
    `/* getTopicProvenanceFacts */
    SELECT e.id, e.created_via, c.client_id, c.client_name, c.metadata_url, c.verified_at
    FROM topics e
    LEFT JOIN oauth_clients c ON c.id = e.created_via_oauth_client_id
    WHERE e.id = ANY($1::uuid[])`,
    [topicIds],
    options,
  )
  return mapProvenanceFacts(rows)
}

/** The creation channel and OAuth client of already-visible lists, in one query. */
export async function getListProvenanceFacts(
  listIds: string[],
  options: QueryOptions = {},
): Promise<FactsByEntityId> {
  if (listIds.length === 0) return new Map()
  const { rows } = await read<ProvenanceFactsRow>(
    `/* getListProvenanceFacts */
    SELECT e.id, e.created_via, c.client_id, c.client_name, c.metadata_url, c.verified_at
    FROM user_lists e
    LEFT JOIN oauth_clients c ON c.id = e.created_via_oauth_client_id
    WHERE e.id = ANY($1::uuid[])`,
    [listIds],
    options,
  )
  return mapProvenanceFacts(rows)
}

/** The creation channel and OAuth client of already-visible RSS feeds, in one query. */
export async function getRssFeedProvenanceFacts(
  rssFeedIds: string[],
  options: QueryOptions = {},
): Promise<FactsByEntityId> {
  if (rssFeedIds.length === 0) return new Map()
  const { rows } = await read<ProvenanceFactsRow>(
    `/* getRssFeedProvenanceFacts */
    SELECT e.id, e.created_via, c.client_id, c.client_name, c.metadata_url, c.verified_at
    FROM rss_feeds e
    LEFT JOIN oauth_clients c ON c.id = e.created_via_oauth_client_id
    WHERE e.id = ANY($1::uuid[])`,
    [rssFeedIds],
    options,
  )
  return mapProvenanceFacts(rows)
}
