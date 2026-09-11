import { write } from '@data-stores/psql'

export async function retainCurrentPublicationTopicIds(
  workId: string,
  postIds: string[],
  topicAliasId: string | null,
): Promise<void> {
  if (postIds.length === 0 && !topicAliasId) return
  await write(
    `/* retainCurrentPublicationTopicIds */
    INSERT INTO post_publication_dirty_work_keys (dirty_work_id, kind, uuid_value)
    SELECT dirty_work_id, kind, uuid_value FROM (
      SELECT DISTINCT topic_id FROM (
      SELECT topic_id FROM post_review_topic_ratings WHERE post_id = ANY($2::uuid[])
      UNION SELECT topic_id FROM post_data_point_topics WHERE post_id = ANY($2::uuid[])
      UNION SELECT object_id AS topic_id FROM relation__post__category__topic
        WHERE subject_id = ANY($2::uuid[]) AND deleted_at IS NULL
      UNION SELECT alias.topic_id FROM post_topic_alias_sources source
        JOIN topic_aliases alias ON alias.id = source.topic_alias_id
        WHERE source.post_id = ANY($2::uuid[]) AND alias.topic_id IS NOT NULL
      UNION SELECT alias.topic_id FROM relation__post__category__topic_alias relation
        JOIN topic_aliases alias ON alias.id = relation.object_id
        WHERE relation.subject_id = ANY($2::uuid[])
          AND relation.deleted_at IS NULL
          AND relation.votes_score_net > 0
          AND alias.topic_id IS NOT NULL
      UNION SELECT topic_id FROM topic_aliases
        WHERE id = $3::uuid AND topic_id IS NOT NULL
      ) topics WHERE topic_id IS NOT NULL
    ) unique_topics
    CROSS JOIN LATERAL (
      SELECT $1::uuid AS dirty_work_id, 'impact_topic'::text AS kind, topic_id AS uuid_value
    ) source
    ORDER BY dirty_work_id, kind, uuid_value
    ON CONFLICT (dirty_work_id, kind, uuid_value) WHERE uuid_value IS NOT NULL DO NOTHING`,
    [workId, postIds, topicAliasId],
  )
}
