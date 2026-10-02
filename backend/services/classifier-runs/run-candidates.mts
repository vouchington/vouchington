import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { StoryRunCandidate } from './types.mts'

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
    SELECT topic_id FROM classifier_run_candidates
    WHERE run_id = ${runId} AND topic_id IS NOT NULL ORDER BY ordinal
  `)
  return rows.map(row => row.topic_id)
}

/** Persists a story-clustering run's captured stories and standalone items, in order. */
export async function insertClassifierRunStoryCandidates(
  query: QueryExecutor,
  runId: string,
  candidates: readonly StoryRunCandidate[],
): Promise<void> {
  await query(sql`/* insertClassifierRunStoryCandidates */
    INSERT INTO classifier_run_candidates (run_id, story_id, rss_feed_item_id, ordinal)
    SELECT ${runId},
      CASE WHEN candidate.kind = 'story' THEN candidate.entity_id END,
      CASE WHEN candidate.kind = 'rss_feed_item' THEN candidate.entity_id END,
      (candidate.ordinal - 1)::int
    FROM unnest(${candidates.map(candidate => candidate.kind)}::text[],
      ${candidates.map(candidate =>
        candidate.kind === 'story' ? candidate.storyId : candidate.rssFeedItemId,
      )}::uuid[]) WITH ORDINALITY AS candidate (kind, entity_id, ordinal)
  `)
}

export async function readClassifierRunStoryCandidates(
  query: QueryExecutor,
  runId: string,
): Promise<StoryRunCandidate[]> {
  const { rows } = await query<{ kind: StoryRunCandidate['kind']; entity_id: string }>(sql`
    /* readClassifierRunStoryCandidates */
    SELECT CASE WHEN story_id IS NOT NULL THEN 'story' ELSE 'rss_feed_item' END AS kind,
      COALESCE(story_id, rss_feed_item_id) AS entity_id
    FROM classifier_run_candidates
    WHERE run_id = ${runId} AND topic_id IS NULL ORDER BY ordinal
  `)
  return rows.map(row =>
    row.kind === 'story'
      ? { kind: 'story', storyId: row.entity_id }
      : { kind: 'rss_feed_item', rssFeedItemId: row.entity_id },
  )
}
