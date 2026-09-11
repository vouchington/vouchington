'use client'

import { clientApi } from './instance'
import { clearVote, submitVote, type RelationChoice } from './elections'
import type { EntityRelation, EntityRelationsResponse } from '../entity-relations'

/**
 * Create a directed editorial relation. User-subject social relations (follow, mute, block,
 * save, etc.) must use the bookmarks client; curated user tags use this endpoint.
 */
export async function createEntityRelation(
  entityType: string,
  entityId: string,
  predicate: string,
  objectType: string,
  objectId: string,
): Promise<EntityRelation> {
  const data = await clientApi.post<{ relation: EntityRelation }>(
    `/api/v1/entity-relations/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/${encodeURIComponent(predicate)}/${encodeURIComponent(objectType)}`,
    { objectId },
  )

  return data.relation
}

export async function submitEntityRelationVote(id: string, choice: RelationChoice): Promise<void> {
  await submitVote<'relation'>('entity-relations', id, choice)
}
export const clearEntityRelationVote = (id: string) => clearVote('entity-relations', id)

/**
 * Fetch editorial relations, including curated tags on users.
 * Client-side equivalent of the server helper in @/lib/api/server/entity-relations.
 * Does NOT apply a net-score filter — returns all relations so the modal can show downvoted ones.
 */
export async function fetchEntityRelations(
  entityType: string,
  entityId: string,
  predicate: string,
  objectType: string,
  options?: {
    sort?: string
    after?: string
    limit?: number
    positiveNetVoteScore?: boolean
    summary?: boolean
  },
): Promise<EntityRelationsResponse> {
  const searchParams = new URLSearchParams()
  if (options?.sort) searchParams.set('sort', options.sort)
  if (options?.after) searchParams.set('after', options.after)
  if (options?.limit !== undefined) searchParams.set('limit', String(options.limit))
  if (options?.positiveNetVoteScore !== undefined) {
    searchParams.set('positiveNetVoteScore', String(options.positiveNetVoteScore))
  }
  if (options?.summary !== undefined) searchParams.set('summary', String(options.summary))
  const qs = searchParams.toString() ? `?${searchParams.toString()}` : ''
  return clientApi.get<EntityRelationsResponse>(
    `/api/v1/entity-relations/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/${encodeURIComponent(predicate)}/${encodeURIComponent(objectType)}${qs}`,
  )
}
