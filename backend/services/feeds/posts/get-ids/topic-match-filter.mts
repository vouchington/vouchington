import {
  POST_TOPIC_CATEGORY_RELATION_TABLE,
  POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE,
} from '@services/entity-relations/metadata'
import sql from 'sql-template-strings'

export function buildDirectTopicsFilter() {
  // Scalar probes keep each child read keyed to the candidate post. The inner
  // COALESCE keeps membership as a hashed subplan over followed_topics, avoiding
  // both global post-relation joins and a proxy-list rescan for every post.
  const filter = sql`COALESCE((SELECT TRUE FROM `.append(POST_TOPIC_CATEGORY_RELATION_TABLE)
    .append(sql` relation
      WHERE relation.subject_id = eligible_posts.id
        AND COALESCE(relation.object_id IN (SELECT topic_id FROM followed_topics), FALSE)
        AND relation.deleted_at IS NULL AND relation.votes_score_net > 0
      LIMIT 1), FALSE)
    OR COALESCE((SELECT TRUE FROM post_review_topic_ratings rating
      WHERE rating.post_id = eligible_posts.id
        AND COALESCE(rating.topic_id IN (SELECT topic_id FROM followed_topics), FALSE)
      LIMIT 1), FALSE)`)
  filter
    .append(sql`
    OR COALESCE((SELECT TRUE FROM `)
    .append(POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE).append(sql` relation
      JOIN topic_aliases alias ON alias.id = relation.object_id
        AND COALESCE(alias.topic_id IN (SELECT topic_id FROM followed_topics), FALSE)
      WHERE relation.subject_id = eligible_posts.id
        AND relation.deleted_at IS NULL AND relation.votes_score_net > 0
      LIMIT 1), FALSE)`)
  return filter
}
