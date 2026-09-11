import type { QueryOptions } from '@data-stores/psql/types'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import type { EntityRelation } from './upsert-helpers.mts'
import { writeEntityRelations } from './write-relations.mts'

const USER_MUTE_RELATION = getEntityRelationMetadataOrThrow({
  subjectType: 'user',
  predicate: 'mute',
  objectType: 'user',
})

const SYSTEM_USER_FOR_RELATIONS = {
  __entity_type: 'user' as const,
  id: '',
  roles: [] as const,
}

export async function upsertUserMuteRelations(
  subjectUserId: string,
  objectUserIds: string[],
  options: QueryOptions = {},
): Promise<EntityRelation[]> {
  if (objectUserIds.length === 0) return []

  const creator = {
    ...SYSTEM_USER_FOR_RELATIONS,
    id: subjectUserId,
  }

  return writeEntityRelations(
    USER_MUTE_RELATION,
    creator,
    objectUserIds.map(objectId => ({
      subject: { id: subjectUserId },
      object: { id: objectId },
    })),
    { query: options.query, vote: false },
  )
}
