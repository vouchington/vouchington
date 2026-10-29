import { read } from '@data-stores/psql'
import type { createTopicRevision } from '../../services/topic-revisions/index.mts'

type TopicRevision = Awaited<ReturnType<typeof createTopicRevision>>

export async function getTopicRevisionsForTest(topicId: string): Promise<TopicRevision[]> {
  const { rows } = await read<TopicRevision>(
    `/* getTopicRevisionsForTest */
      SELECT id, topic_id, revision_type, revised_by_id, changes, created_at
      FROM topic_revisions
      WHERE topic_id = $1
      ORDER BY id`,
    [topicId],
  )
  return rows
}

export async function readTestTopicRevisionChild(revisionId: string): Promise<string> {
  const { rows } = await read<{ partition: string }>(
    `/* readTestTopicRevisionChild */
      SELECT tableoid::regclass::text AS partition
      FROM topic_revisions
      WHERE id = $1`,
    [revisionId],
  )
  if (!rows[0]) throw new Error('Expected a topic revision')
  return rows[0].partition
}

export async function getTopicContentAttributionForTest(topicId: string): Promise<{
  content_updated_at: Date | null
  content_updated_by_id: string | null
}> {
  const { rows } = await read<{
    content_updated_at: Date | null
    content_updated_by_id: string | null
  }>(
    `/* getTopicContentAttributionForTest */
      SELECT content_updated_at, content_updated_by_id
      FROM topics
      WHERE id = $1`,
    [topicId],
  )
  return rows[0]
}
