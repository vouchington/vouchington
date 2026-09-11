import type { QueryOptions } from '@data-stores/psql/types'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations'
import { softDeleteEntityRelation } from '@services/entity-relations/delete'
import { createUnlinkedTopicAlias } from '@services/topics/aliases'
import type { PrivateUser } from '@services/users/types'
import type { CreatePostUpdates } from './types.mts'
import {
  extractExplicitHashtag,
  getPostHashtagOccurrences,
  type HashtagOccurrence,
} from './hashtag-occurrences.mts'
import {
  getExistingExplicitHashtags,
  getExistingHashtagSources,
  replacePostHashtagSources,
  type PostHashtagSource,
} from './hashtag-sources.mts'
export { getRetainedPostCategories } from './hashtag-retained-categories.mts'

type Alias = { id: string; alias: string }

export async function syncPostHashtagCategoriesInTransaction(
  creator: PrivateUser,
  postId: string,
  updates: CreatePostUpdates,
  options: QueryOptions,
): Promise<void> {
  const existingSources = await getExistingHashtagSources(postId, options)
  const existingExplicit =
    updates.categories === undefined ? getExistingExplicitHashtags(existingSources) : []
  const occurrences = [
    ...getPostHashtagOccurrences(updates),
    ...existingExplicit.flatMap(hashtag => extractExplicitHashtag(hashtag)),
  ]
  const aliases = await createHashtagAliases(occurrences, options)
  const existingContributorsByAliasAndSource = new Map(
    existingSources.map(source => [
      `${source.topic_alias_id}:${source.source}`,
      source.contributor_id,
    ]),
  )
  const firstByAliasAndSource = new Map<string, PostHashtagSource>()
  for (const occurrence of occurrences) {
    const alias = aliases.get(occurrence.key)!
    const key = `${alias.id}:${occurrence.source}`
    if (!firstByAliasAndSource.has(key)) {
      firstByAliasAndSource.set(key, {
        aliasId: alias.id,
        contributorId:
          existingContributorsByAliasAndSource.get(`${alias.id}:${occurrence.source}`) ??
          creator.id,
        source: occurrence.source,
        authored: occurrence.authored,
      })
    }
  }
  await replacePostHashtagSources(postId, [...firstByAliasAndSource.values()], options)
  const aliasRelation = getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    objectType: 'topic_alias',
    predicate: 'category',
  })
  const existingAliasIds = await getActiveRelationObjectIds(
    aliasRelation.table_name,
    postId,
    options,
  )
  const removedAliasIds: Array<{ id: string }> = []
  for (const id of existingAliasIds) {
    if (![...aliases.values()].some(alias => alias.id === id)) removedAliasIds.push({ id })
  }
  await softDeleteEntityRelation(creator, aliasRelation, { id: postId }, removedAliasIds, options)
  await upsertEntityRelation(
    creator,
    aliasRelation,
    { id: postId },
    [...aliases.values()].map(alias => ({ id: alias.id })),
    { ...options, vote: false },
  )
  const topicIds = [
    ...new Set(
      (updates.categories ?? []).flatMap(category =>
        category.type === 'topic' ? [category.topic_id] : [],
      ),
    ),
  ]
  if (updates.categories !== undefined) {
    const topicRelation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'topic',
      predicate: 'category',
    })
    if (topicIds.length > 0)
      await upsertEntityRelation(
        creator,
        topicRelation,
        { id: postId },
        topicIds.map(id => ({ id })),
        { ...options, vote: false },
      )
  }
}

export function getPostHashtagKeys(updates: CreatePostUpdates): string[] {
  return [...new Set(getPostHashtagOccurrences(updates).map(occurrence => occurrence.key))]
}

export function getOrderedHashtagAliasClaims(
  occurrences: HashtagOccurrence[],
): HashtagOccurrence[] {
  const firstOccurrenceByKey = new Map<string, HashtagOccurrence>()
  for (const occurrence of occurrences) {
    if (!firstOccurrenceByKey.has(occurrence.key)) {
      firstOccurrenceByKey.set(occurrence.key, occurrence)
    }
  }
  return [...firstOccurrenceByKey.values()].sort((left, right) =>
    compareHashtagKeys(left.key, right.key),
  )
}

async function createHashtagAliases(
  occurrences: HashtagOccurrence[],
  options: QueryOptions,
): Promise<Map<string, Alias>> {
  const aliases = new Map<string, Alias>()
  for (const claim of getOrderedHashtagAliasClaims(occurrences)) {
    // oxlint-disable-next-line no-await-in-loop -- sorted claims acquire conflict locks in deterministic order
    aliases.set(claim.key, await createUnlinkedTopicAlias(claim.authored, options))
  }
  return aliases
}

function compareHashtagKeys(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

async function getActiveRelationObjectIds(
  tableName: string,
  postId: string,
  options: QueryOptions,
): Promise<string[]> {
  const query = sql`/* getActiveRelationObjectIds */ SELECT object_id FROM `
  query.append(tableName)
  query.append(sql` WHERE subject_id = ${postId} AND deleted_at IS NULL`)
  const { rows } = await write<{ object_id: string }>(query, options)
  return rows.map(row => row.object_id)
}
