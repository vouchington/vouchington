import sql from 'sql-template-strings'
import type { SearchUrlHostnamesOptions } from './search-types.mts'

export function appendTopicFilters(
  filters: ReturnType<typeof sql>[],
  { include_descendants = false, topic_match = 'any' }: SearchUrlHostnamesOptions,
  effectiveTopicIds: string[],
): void {
  if (effectiveTopicIds.length === 0) return
  if (!include_descendants) {
    appendDirectTopicFilter(filters, topic_match, effectiveTopicIds)
    return
  }
  if (topic_match === 'all' && effectiveTopicIds.length > 1) {
    for (const topicId of effectiveTopicIds) {
      filters.push(sql`EXISTS (
        SELECT 1 FROM topic_descendants
        WHERE topic_descendants.root_post_id = ${topicId}
          AND topic_descendants.topic_id = h.topic_id
      )`)
    }
  } else {
    filters.push(sql`EXISTS (
      SELECT 1
      FROM topic_descendants
      WHERE topic_descendants.topic_id = h.topic_id
    )`)
  }
}

export function appendDescendantRootFilter(
  query: ReturnType<typeof sql>,
  { topic_match = 'any' }: SearchUrlHostnamesOptions,
  effectiveTopicIds: string[],
): void {
  if (topic_match !== 'all' || effectiveTopicIds.length < 2) return
  const [first, ...others] = effectiveTopicIds
  query.append(sql` WHERE topic_descendants.root_post_id = ${first}`)
  for (const topicId of others) {
    query.append(sql` AND EXISTS (
      SELECT 1 FROM topic_descendants other_root
      WHERE other_root.root_post_id = ${topicId}
        AND other_root.topic_id = topic_descendants.topic_id
    )`)
  }
}

function appendDirectTopicFilter(
  filters: ReturnType<typeof sql>[],
  topicMatch: SearchUrlHostnamesOptions['topic_match'],
  effectiveTopicIds: string[],
): void {
  if (effectiveTopicIds.length === 1) {
    filters.push(sql`topic_id = ${effectiveTopicIds[0]}`)
  } else if (topicMatch === 'all') {
    filters.push(sql`FALSE`)
  } else {
    filters.push(sql`topic_id = ANY(${effectiveTopicIds})`)
  }
}
