import sql, { type SQLStatement } from 'sql-template-strings'
import {
  buildTopicMembershipExists,
  buildTopicAliasMembershipExists,
  buildUniversalTopicPostCandidatePairsSelect,
} from '@modules/feed-query-builders'

export function appendUniversalTopicFilters(
  query: SQLStatement,
  topicIds: string[],
  postAlias: 'p' | 'posts' = 'p',
) {
  const uniqueTopicIds = [...new Set(topicIds)]
  if (uniqueTopicIds.length === 0) return
  const postIdColumn = postAlias === 'posts' ? 'posts.id' : 'p.id'
  query
    .append(sql`
      AND `)
    .append(postIdColumn)
    .append(sql` IN (
        SELECT universal_topic_candidates.post_id
        FROM (`)
    .append(buildUniversalTopicPostCandidatePairsSelect(uniqueTopicIds))
    .append(sql`) universal_topic_candidates
        GROUP BY universal_topic_candidates.post_id
        HAVING COUNT(*) = ${uniqueTopicIds.length}
      )
    `)
}

export function appendHashtagFilters(
  query: SQLStatement,
  {
    aliasIds,
    hasUnknownHashtag,
    topicIds,
  }: {
    aliasIds: string[] | undefined
    hasUnknownHashtag: boolean | undefined
    topicIds: string[] | undefined
  },
  postAlias: 'p' | 'posts' = 'p',
) {
  const postIdColumn = postAlias === 'posts' ? 'posts.id' : 'p.id'
  if (hasUnknownHashtag) query.append(sql` AND FALSE`)
  for (const topicId of [...new Set(topicIds ?? [])]) {
    query.append(sql`\n      AND `).append(buildTopicMembershipExists(postIdColumn, topicId))
  }
  for (const aliasId of [...new Set(aliasIds ?? [])]) {
    query.append(sql`\n      AND `).append(buildTopicAliasMembershipExists(postIdColumn, aliasId))
  }
}
