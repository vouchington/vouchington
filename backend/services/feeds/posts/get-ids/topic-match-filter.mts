import { buildFollowedTopicsCondition } from '../../sql-builders/index.mts'
import {
  POST_TOPIC_CATEGORY_RELATION_TABLE,
  POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE,
} from '@services/entity-relations/metadata'
import sql from 'sql-template-strings'

export function buildDirectTopicsFilter() {
  const filter = buildFollowedTopicsCondition([
    {
      type: 'related_topics',
      tableName: POST_TOPIC_CATEGORY_RELATION_TABLE,
      itemIdColumn: 'eligible_posts.id',
    },
    {
      type: 'review_topics',
      tableName: 'post_review_topic_ratings',
      itemIdColumn: 'eligible_posts.id',
    },
  ])
  filter
    .append(sql`
    OR EXISTS (
      SELECT 1
      FROM `)
    .append(POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE).append(sql` relation
      JOIN topic_aliases alias ON alias.id = relation.object_id
      JOIN followed_topics ON followed_topics.topic_id = alias.topic_id
      WHERE relation.subject_id = eligible_posts.id
        AND relation.deleted_at IS NULL AND relation.votes_score_net > 0
    )`)
  return filter
}
