import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type AutotaggerCandidateTopic = { topicId: string; name: string }

/** The display name of each captured candidate topic, in the run's captured order. */
export async function readAutotaggerCandidateTopics(
  topicIds: readonly string[],
): Promise<AutotaggerCandidateTopic[]> {
  const { rows } = await write<{
    topic_id: string
    name: string
  }>(
    sql`/* readAutotaggerCandidateTopics */
    SELECT topic.id AS topic_id, topic.name
    FROM unnest(${[...topicIds]}::uuid[]) WITH ORDINALITY AS candidate (topic_id, ordinal)
    -- no-mistakes-disable-next-line postgres-required-predicates: the run asks exactly the question set its receipt captured, and vote application binds to the same ids, so a retry or reclaim never asks a different set after a topic changes lifecycle state
    JOIN topics topic ON topic.id = candidate.topic_id
    ORDER BY candidate.ordinal
  `,
  )
  if (rows.length !== topicIds.length) {
    throw new Error('tagging run candidate topics are missing')
  }
  return rows.map(row => ({ topicId: row.topic_id, name: row.name }))
}
