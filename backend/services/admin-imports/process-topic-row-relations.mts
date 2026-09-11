import { replaceSpendingCategoryAttributes } from '@services/topics/spending-categories'
import { updateRetailerAttributes } from '@services/topics/retailers'
import { getTopicBySlug } from '@services/topics/get'
import { getTopicsBySlugBatch } from '@services/topics/get-batch'
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
  const parentTopics = await getTopicsBySlugBatch(parentSlugs)
  await Promise.all(
    parentTopics.flatMap(topic =>
      topic
        ? [upsertEntityRelation(admin, parentRelation, { id: topicId }, [{ id: topic.id }])]
        : [],
    ),
  )
}
