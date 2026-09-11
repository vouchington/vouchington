import type { EntityRelationEntityType } from '@services/entity-relations/config'
import type { PrivateUser } from '@voucha/types/entities/user'
import {
  mapBookmarkRowsToOutput,
  queryBookmarksForAllRelations,
  queryBookmarksForRelation,
  type BookmarkRow,
} from './query.mts'
import {
  getUserBookmarkRelationsForEntityType,
  checkBookmarkBloomCandidatesByRelations,
  isBookmarkBloomFilterEnabled,
} from './bloom-filter.mts'
import { enqueueBackfillUserBookmarkBloomFilter } from '@queues/bloom-filters/enqueues'

export const getBookmarksForEntities = async (
  user: PrivateUser,
  entityTypeName: EntityRelationEntityType,
  entities: Array<{ id: string } | string>,
) => {
  if (entities.length === 0) return {}

  const relations = getUserBookmarkRelationsForEntityType(entityTypeName)
  if (relations.length === 0) return {}

  const objectIds = entities.map(x => (typeof x === 'string' ? x : x.id))

  if (!isBookmarkBloomFilterEnabled()) {
    return queryBookmarksForAllRelations(user.id, entityTypeName, relations, objectIds)
  }

  const relationTableNames = relations.map(relation => relation.table_name)
  const bloomCandidatesByRelation = await checkBookmarkBloomCandidatesByRelations(
    user.id,
    relationTableNames,
    objectIds,
  )

  let needsBackfill = false
  const relationPlans = relations.map(relation => {
    let objectIdsToQuery = objectIds
    const bloomCandidates = bloomCandidatesByRelation[relation.table_name]
    if (bloomCandidates?.ready) {
      objectIdsToQuery = []
      for (let index = 0; index < objectIds.length; index += 1) {
        if (bloomCandidates.results[index] !== false) {
          objectIdsToQuery.push(objectIds[index]!)
        }
      }
    } else {
      needsBackfill = true
    }

    return { relation, objectIdsToQuery }
  })

  // enqueueBackfillUserBookmarkBloomFilter already attaches .catch(onError) internally
  if (needsBackfill) void enqueueBackfillUserBookmarkBloomFilter({ userId: user.id })

  // objectIdsToQuery === objectIds (same reference) when bloom is not ready — no narrowing needed
  const fullObjectIdRelations: typeof relations = []
  const narrowedPlans: typeof relationPlans = []
  for (const plan of relationPlans) {
    if (plan.objectIdsToQuery === objectIds) {
      fullObjectIdRelations.push(plan.relation)
    } else {
      narrowedPlans.push(plan)
    }
  }
  if (narrowedPlans.length === 0) {
    return queryBookmarksForAllRelations(user.id, entityTypeName, relations, objectIds)
  }

  const narrowedRelationRowPromises: Promise<BookmarkRow[]>[] = []
  for (const plan of narrowedPlans) {
    if (plan.objectIdsToQuery.length === 0) continue
    narrowedRelationRowPromises.push(
      queryBookmarksForRelation(user.id, entityTypeName, plan.relation, plan.objectIdsToQuery),
    )
  }

  const [narrowedRows, fullRelationsResult] = await Promise.all([
    Promise.all(narrowedRelationRowPromises),
    fullObjectIdRelations.length === 0
      ? Promise.resolve<Record<string, Record<string, boolean>>>({})
      : queryBookmarksForAllRelations(user.id, entityTypeName, fullObjectIdRelations, objectIds),
  ])

  const narrowedResult = mapBookmarkRowsToOutput(narrowedRows)
  const mergedResult = { ...fullRelationsResult }
  for (const [entityId, bookmarks] of Object.entries(narrowedResult)) {
    if (!mergedResult[entityId]) {
      mergedResult[entityId] = {}
    }
    Object.assign(mergedResult[entityId], bookmarks)
  }

  return mergedResult
}

export const getBookmarksForEntity = async (
  user: PrivateUser,
  entityTypeName: EntityRelationEntityType,
  entity: { id: string } | string,
) => {
  const bookmarks = await getBookmarksForEntities(user, entityTypeName, [entity])
  const entityId = typeof entity === 'string' ? entity : entity.id
  return bookmarks[entityId] || {}
}
