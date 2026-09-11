import type { BasicUser } from '@voucha/types/entities/user'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { getEntityRelationMetadataOrThrow, type EntityRelationMetadata } from './metadata.mts'
import { buildInsertQuery } from './build-insert-query.mts'
import { assertPostRelatedUrlsAllowed } from './assert-post-related-urls-allowed.mts'
import { assertUrlObjectsAreValid } from './assert-url-objects-are-valid.mts'
import { maintainBookmarkBloomForRelations } from './bookmark-bloom-maintenance.mts'
import { runRelationPublicationMutation } from './publication-mutation.mts'
import {
  handleElectionVotes,
  type EntityIdentifier,
  type EntityRelation,
  getEntityId,
  type InternalEntityRelationMutationResult,
  type UpsertEntityRelationsOptions,
  type UpsertEntityTypes,
  toPublicEntityRelations,
} from './upsert-helpers.mts'

export async function writeEntityRelations(
  relation: EntityRelationMetadata,
  creator: BasicUser,
  pairs: Array<{
    subject: UpsertEntityTypes | EntityIdentifier
    object: UpsertEntityTypes | EntityIdentifier
  }>,
  options?: UpsertEntityRelationsOptions & QueryOptions,
): Promise<EntityRelation[]> {
  if (pairs.length === 0) return []

  const objects = pairs.map(pair => pair.object)
  await assertUrlObjectsAreValid(relation, objects, creator.id, options)
  await Promise.all(
    groupPairsBySubject(pairs).map(({ subject, objects }) =>
      assertPostRelatedUrlsAllowed(creator, relation, subject, objects, options),
    ),
  )
  const query = buildInsertQuery(relation, creator, pairs, options)
  const internalRelations = await runRelationPublicationMutation(
    options,
    relation.table_name,
    pairs.map(pair => pair.subject.id),
    pairs.map(pair => pair.object.id),
    relation.subject_type === 'user' ? pairs.map(pair => pair.subject.id) : [],
    async transactionQuery => {
      const { rows } = await transactionQuery(query)
      return rows as InternalEntityRelationMutationResult[]
    },
  )
  const relations = toPublicEntityRelations(internalRelations)

  await handleElectionVotes(creator, relation, relations, options)

  // Bloom maintenance writes to Valkey (separate connection from the DB transaction), so
  // awaiting it does not hold DB row locks. If the transaction later rolls back, the bloom
  // entry becomes a false positive — which causes a DB fallback read (correct result).
  await maintainBookmarkBloomForRelations(relation, relations)

  return relations
}

/**
 * Inserts already safety-screened post related URLs in a caller-owned transaction. This narrow
 * boundary deliberately performs no safety or authorization checks: projection receipts record
 * safety decisions, and the caller owns authorization before the publication lock is held. It dispatches no effects,
 * leaving the caller's atomic publication unit intact.
 */
export async function insertPrevalidatedPostRelatedUrlEntityRelationsInTransaction(
  query: TransactionQuery,
  creator: BasicUser,
  postId: string,
  urlIds: readonly string[],
): Promise<EntityRelation[]> {
  if (urlIds.length === 0) return []

  const relation = getPostRelatedUrlRelationMetadata()
  const objects = urlIds.map(id => ({ id }))
  const insert = buildInsertQuery(
    relation,
    creator,
    objects.map(object => ({ subject: { id: postId }, object })),
  )
  const { rows } = await query(insert)
  return toPublicEntityRelations(rows as InternalEntityRelationMutationResult[])
}

function getPostRelatedUrlRelationMetadata(): EntityRelationMetadata {
  return getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    predicate: 'related',
    objectType: 'url',
  })
}

function groupPairsBySubject(
  pairs: Array<{
    subject: UpsertEntityTypes | EntityIdentifier
    object: UpsertEntityTypes | EntityIdentifier
  }>,
): Array<{
  subject: UpsertEntityTypes | EntityIdentifier
  objects: Array<UpsertEntityTypes | EntityIdentifier>
}> {
  const groups = new Map<
    string,
    {
      subject: UpsertEntityTypes | EntityIdentifier
      objects: Array<UpsertEntityTypes | EntityIdentifier>
    }
  >()
  for (const pair of pairs) {
    const subjectId = getEntityId(pair.subject)
    const existing = groups.get(subjectId)
    if (existing) existing.objects.push(pair.object)
    else groups.set(subjectId, { subject: pair.subject, objects: [pair.object] })
  }
  return [...groups.values()]
}
