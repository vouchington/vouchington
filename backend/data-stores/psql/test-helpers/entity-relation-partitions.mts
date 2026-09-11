import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

// @data-stores/psql cannot depend on @voucha/test-helpers (see users.mts in this directory for why).
// This is a straight duplicate of test-helpers' entity-relation-partitions.mts, minus
// getHashPartitionMetadata/getUserFollowTopicPartitionDistribution (dead code with zero consumers,
// dropped rather than duplicated). The only consumer of any of this is
// 0000-00-01-entity-relations.test.mts, which lives inside this same package.

/**
 * Returns partition kind rows (table_name + partition_expression) for multiple tables in one query.
 */
export async function getPostSubjectTablePartitionKinds(
  tableNames: string[],
): Promise<Array<{ table_name: string; partition_expression: string }>> {
  const { rows } = await read(sql`
    SELECT
      parent.relname AS table_name,
      pg_get_partition_constraintdef(child.oid) AS partition_expression
    FROM pg_inherits
    JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
    JOIN pg_class child  ON pg_inherits.inhrelid  = child.oid
    WHERE parent.relname = ANY(${tableNames})
    ORDER BY parent.relname, child.relname
  `)
  return rows as Array<{ table_name: string; partition_expression: string }>
}

/**
 * Returns all follow relations for the given user IDs from relation__user__follow__topic.
 */
export async function getUserFollowTopicRelationsBySubjectIds(
  userIds: string[],
): Promise<Array<{ subject_id: string; object_id: string }>> {
  const { rows } = await read(sql`
    SELECT subject_id, object_id
    FROM relation__user__follow__topic
    WHERE subject_id = ANY(${userIds})
      AND deleted_at IS NULL
  `)
  return rows as Array<{ subject_id: string; object_id: string }>
}

/**
 * Returns all follow relations for the given topic IDs from relation__user__follow__topic.
 */
export async function getUserFollowTopicRelationsByTopicIds(
  topicIds: string[],
): Promise<Array<{ subject_id: string; object_id: string }>> {
  const { rows } = await read(sql`
    SELECT subject_id, object_id
    FROM relation__user__follow__topic
    WHERE object_id = ANY(${topicIds})
      AND deleted_at IS NULL
  `)
  return rows as Array<{ subject_id: string; object_id: string }>
}

/**
 * Inserts a row into relation__user__follow__topic. Silently ignores conflicts.
 */
export async function insertUserFollowTopicRelation(
  userId: string,
  topicId: string,
): Promise<void> {
  await write(sql`
    INSERT INTO relation__user__follow__topic (subject_id, object_id)
    VALUES (${userId}, ${topicId})
    ON CONFLICT DO NOTHING
  `)
}

/**
 * Creates a minimal topic for use in partition distribution tests.
 * Returns the new topic ID.
 */
export async function createTopicForRelationPartitionTest(
  topicName: string,
  topicSlug: string,
  userId: string,
  sha256: string,
): Promise<string> {
  const { rows } = await write(sql`
    INSERT INTO topics (name, slug, created_by_id, topic_type, bedrock_nova_multimodal_v1_content_sha256)
    VALUES (${topicName}, ${topicSlug}, ${userId}, 'topic', ${sha256})
    RETURNING id
  `)
  const topicId = rows[0].id as string
  await write(sql`
    INSERT INTO topic_metrics (topic_id) VALUES (${topicId})
    ON CONFLICT (topic_id) DO NOTHING
  `)
  return topicId
}
