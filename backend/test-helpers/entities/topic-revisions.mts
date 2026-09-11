import { read } from '@data-stores/psql'
import type { TopicRevision } from '../../services/topic-revisions/index.mts'

export async function getTopicRevisionsForTest(topicId: string): Promise<TopicRevision[]> {
  const { rows } = await read<TopicRevision>(
    `/* getTopicRevisionsForTest */
      SELECT id, topic_id, revision_type, revised_by_id, revised_by_roles, changes, created_at
      FROM topic_revisions
      WHERE topic_id = $1
      ORDER BY id`,
    [topicId],
  )
  return rows
}
