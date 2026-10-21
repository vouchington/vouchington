import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { upsertEntityRelation } from '../services/entity-relations/upsert.mts'
import { getEntityRelationMetadataOrThrow } from '../services/entity-relations/metadata.mts'
import type { PrivateUser } from '../services/users/types.mts'

/** Deterministically models a merge committing after early validation but before the writer lock. */
export async function insertParentAcrossTopicMerge(
  user: PrivateUser,
  subjectId: string,
  objectId: string,
  merge: () => Promise<unknown>,
) {
  await using query = await beginTransaction()
  let merged = false
  const interleaved = new Proxy(query, {
    async apply(target, thisArgument, argumentsList: Parameters<QueryExecutor>) {
      const input = argumentsList[0]
      const statement = typeof input === 'string' ? input : input.text
      if (!merged && statement.includes('lockAndAssertTopicParentRelations')) {
        merged = true
        await merge()
      }
      return Reflect.apply(target, thisArgument, argumentsList)
    },
  })
  const relation = getEntityRelationMetadataOrThrow({
    subjectType: 'topic',
    predicate: 'parent',
    objectType: 'topic',
  })
  return await upsertEntityRelation(user, relation, { id: subjectId }, [{ id: objectId }], {
    query: interleaved,
  })
}
