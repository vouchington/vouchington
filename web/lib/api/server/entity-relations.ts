import { cache } from 'react'
import { serverApi } from './instance'
import type { EntityRelationsResponse } from '@/lib/api/entity-relations'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

/**
 * Fetch editorial relations, including curated user tags. User-subject social relations
 * (follow, mute, block, save, etc.) must use the bookmarks server helper instead.
 */
export const getEntityRelations = cache(
  async (
    entityType: string,
    entityId: string,
    predicate: string,
    objectType: string,
    options: GetOptions = {},
  ): Promise<EntityRelationsResponse> => {
    return serverApi.get<EntityRelationsResponse>(
      `/api/v1/entity-relations/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/${encodeURIComponent(predicate)}/${encodeURIComponent(objectType)}`,
      options,
    )
  },
)
