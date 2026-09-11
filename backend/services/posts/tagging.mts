import { read } from '@data-stores/psql'
import { upsertEntityRelation } from '@services/entity-relations'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import type { PrivateUser } from '@services/users/types'

type TagPostWithTopicsResult = {
  tagged: string[]
  errors: string[]
}

export async function tagPostWithTopics(
  currentUser: PrivateUser,
  postId: string,
  topicSlugs: string[],
): Promise<TagPostWithTopicsResult> {
  const postTopicCategoryRelation = getPostTopicCategoryRelation()
  if (topicSlugs.length === 0) {
    return { tagged: [], errors: [] }
  }

  const lowerSlugs = topicSlugs.map(slug => slug.toLowerCase())

  // Batch lookup all topics in one query, redirecting merged-away source slugs to their
  // destination topic. A slug can only ever belong to one row -- active or merged-away --
  // (topics.slug has a global unique index), so the two branches below never match the
  // same requested slug.
  const { rows: topics } = await read(
    `/* tagPostWithTopics */
    SELECT id, slug
    FROM topics
    WHERE slug = ANY($1) AND deleted_at IS NULL AND merged_into_topic_id IS NULL

    UNION ALL

    SELECT destination_topic.id, source_topic.slug
    FROM topics source_topic
    JOIN topics destination_topic ON destination_topic.id = source_topic.merged_into_topic_id
    WHERE source_topic.slug = ANY($1)
      AND source_topic.deleted_at IS NULL
      AND source_topic.merged_into_topic_id IS NOT NULL
      AND destination_topic.deleted_at IS NULL
      AND destination_topic.merged_into_topic_id IS NULL
    `,
    [lowerSlugs],
  )

  const foundSlugsMap = new Map(topics.map(topic => [topic.slug, topic]))
  const tagged: string[] = []
  const errors: string[] = []

  // Check which topics were found and which were not
  for (const slug of topicSlugs) {
    const topic = foundSlugsMap.get(slug.toLowerCase())
    if (topic) {
      tagged.push(slug)
    } else {
      errors.push(`Topic not found: ${slug}`)
    }
  }

  // Dedupe by id: two requested slugs (e.g. a merged source and its destination) can
  // resolve to the same topic, and upsertEntityRelation must not receive the same
  // target twice in one batch.
  const uniqueTopics = [...new Map(topics.map(topic => [topic.id, topic])).values()]

  // Batch upsert all relations in one call
  if (uniqueTopics.length > 0) {
    await upsertEntityRelation(
      currentUser,
      postTopicCategoryRelation,
      { id: postId },
      uniqueTopics.map(topic => ({ id: topic.id })),
      { vote: true },
    )
  }

  return { tagged, errors }
}

function getPostTopicCategoryRelation() {
  return getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    objectType: 'topic',
    predicate: 'category',
  })
}
