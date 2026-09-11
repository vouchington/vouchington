import sql, { type SQLStatement } from 'sql-template-strings'
import type { FollowedTopicsCondition } from './types.mts'

export function buildFollowedTopicsCondition(conditions: FollowedTopicsCondition[]): SQLStatement {
  const query = sql`/* buildFollowedTopicsCondition:fragment */`

  for (let i = 0; i < conditions.length; i++) {
    const condition = conditions[i]

    if (i > 0) {
      query.append(sql`
        OR
        `)
    }

    if (condition.type === 'related_topics') {
      query
        .append(sql`EXISTS (
          SELECT 1
          FROM `)
        .append(condition.tableName)
        .append(sql`
          JOIN followed_topics ON followed_topics.topic_id = `)
        .append(condition.tableName)
        .append(sql`.object_id
          WHERE `)
        .append(condition.tableName)
        .append(sql`.subject_id = `)
        .append(condition.itemIdColumn)
        .append(sql`
            AND `)
        .append(condition.tableName)
        .append(sql`.deleted_at IS NULL
            AND `)
        .append(condition.tableName).append(sql`.votes_score_net > 0
        )`)
    } else if (condition.type === 'category_topics') {
      query
        .append(sql`EXISTS (
          SELECT 1
          FROM `)
        .append(condition.tableName)
        .append(sql`
          JOIN followed_topics ON followed_topics.topic_id = `)
        .append(condition.tableName)
        .append(sql`.topic_id
          WHERE `)
        .append(condition.tableName)
        .append(sql`.`)
        .append(condition.foreignKeyColumn)
        .append(sql` = `)
        .append(condition.itemIdColumn).append(sql`
        )`)
    } else if (condition.type === 'review_topics') {
      query
        .append(sql`EXISTS (
          SELECT 1
          FROM `)
        .append(condition.tableName)
        .append(sql`
          JOIN followed_topics ON followed_topics.topic_id = `)
        .append(condition.tableName)
        .append(sql`.topic_id
          WHERE `)
        .append(condition.tableName)
        .append(sql`.post_id = `)
        .append(condition.itemIdColumn).append(sql`
        )`)
    }
  }

  return query
}
