import type { EntityRelation, EntityRelationsResponse } from '@/lib/api/entity-relations'

export type { EntityRelation }

export type EntityRelationsResponseBody = EntityRelationsResponse

export interface EntityRelationCreateResponseBody {
  relation: EntityRelation
}
