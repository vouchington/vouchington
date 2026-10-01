import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Persists a run's captured candidate topics, in order, together with the reservation that owns them. */
export async function insertClassifierRunCandidates(
  query: QueryExecutor,
  runId: string,
  topicIds: readonly string[],
): Promise<void> {
  await query(sql`/* insertClassifierRunCandidates */
    INSERT INTO classifier_run_candidates (run_id, topic_id, ordinal)
    SELECT ${runId}, candidate.topic_id, (candidate.ordinal - 1)::int
    FROM unnest(${[...topicIds]}::uuid[]) WITH ORDINALITY AS candidate (topic_id, ordinal)
  `)
}

export async function readClassifierRunCandidateTopicIds(
  query: QueryExecutor,
  runId: string,
): Promise<string[]> {
  const { rows } = await query<{ topic_id: string }>(sql`/* readClassifierRunCandidateTopicIds */
    SELECT topic_id FROM classifier_run_candidates WHERE run_id = ${runId} ORDER BY ordinal
  `)
  return rows.map(row => row.topic_id)
}
