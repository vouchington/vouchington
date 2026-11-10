import { read } from '@data-stores/psql'
import { replaceSpendingCategoryAttributes } from '@services/topics/spending-categories'
import { updateRetailerAttributes } from '@services/topics/retailers'
import { getTopicBySlug } from '@services/topics/get'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import type { PrivateUser } from '@services/users/types'

export async function processTopicExtensions(
  admin: PrivateUser,
  topic: Awaited<ReturnType<typeof getTopicBySlug>> & {},
  exts: string[],
): Promise<void> {
  await Promise.all(
    exts.map(async ext => {
      if (ext === 'spending_category') {
        return replaceSpendingCategoryAttributes(admin, topic, {})
      }
      if (ext === 'retailer') {
        return updateRetailerAttributes(admin, topic)
      }
      return undefined
    }),
  )
}

/** Resolve parent topic ids from literal slugs. Misses, deleted rows, and merges into a deleted or further-merged topic are dropped. */
async function topicIdsByParentSlug(parentSlugs: readonly string[]): Promise<string[]> {
  if (parentSlugs.length === 0) return []

  const normalizedSlugs = parentSlugs.map(slug => slug.toLowerCase().trim())
  const { rows } = await read<{ id: string }>(
    `/* topicIdsByParentSlug */
    SELECT COALESCE(destination.id, source.id) AS id
    FROM unnest($1::text[]) WITH ORDINALITY AS input(slug, ordinality)
    JOIN topics source ON source.slug = input.slug
    LEFT JOIN topics destination
      ON destination.id = source.merged_into_topic_id
     AND destination.deleted_at IS NULL
     AND destination.merged_into_topic_id IS NULL
    WHERE source.deleted_at IS NULL
      AND (
        source.merged_into_topic_id IS NULL
        OR destination.id IS NOT NULL
      )
    ORDER BY input.ordinality
  `,
    [normalizedSlugs],
  )
  return rows.map(row => row.id)
}

export async function processTopicParentRelations(
  admin: PrivateUser,
  topicId: string,
  parentSlugs: string[],
): Promise<void> {
  const parentRelation = getEntityRelationMetadataOrThrow({
    subjectType: 'topic',
    objectType: 'topic',
    predicate: 'parent',
  })
  const parentIds = await topicIdsByParentSlug(parentSlugs)
  await upsertEntityRelation(
    admin,
    parentRelation,
    { id: topicId },
    parentIds.map(id => ({ id })),
  )
}
