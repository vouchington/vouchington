import { getTopicsByReferenceBatch } from '@services/topics/resolve-references'
import type { Topic } from '@services/topics/types'

/** One topic reference. A single reference is a list of one. */
export async function resolveTopic(reference: string): Promise<Topic | null> {
  const [topic] = await resolveTopics([reference])
  return topic ?? null
}

/** Topic references in input order. One statement for the whole list. */
export async function resolveTopics(references: readonly string[]): Promise<Array<Topic | null>> {
  if (references.length === 0) return []
  return getTopicsByReferenceBatch(references)
}

/**
 * Search filters that name topics. One statement for every value. Null means one reference
 * names no topic, so the search is empty the way an unknown id is.
 */
export async function resolvedTopicFilters(filters: {
  topic?: string
  topics?: string[]
  review_topic?: string
  data_point_topic?: string
  category_topic?: string
  category_topics?: string[]
  similar_topic_id?: string
}): Promise<typeof filters | null> {
  const singles = [
    filters.topic,
    filters.review_topic,
    filters.data_point_topic,
    filters.category_topic,
    filters.similar_topic_id,
  ]
  const values = [
    ...singles.filter((value): value is string => value !== undefined),
    ...(filters.topics ?? []),
    ...(filters.category_topics ?? []),
  ]
  if (values.length === 0) return filters
  const topics = await resolveTopics(values)
  if (topics.some(topic => !topic)) return null
  let index = 0
  const take = (value: string | undefined) =>
    value === undefined ? undefined : topics[index++]!.id
  const takeList = (value: string[] | undefined) => value?.map(() => topics[index++]!.id)
  return {
    topic: take(filters.topic),
    review_topic: take(filters.review_topic),
    data_point_topic: take(filters.data_point_topic),
    category_topic: take(filters.category_topic),
    similar_topic_id: take(filters.similar_topic_id),
    topics: takeList(filters.topics),
    category_topics: takeList(filters.category_topics),
  }
}
