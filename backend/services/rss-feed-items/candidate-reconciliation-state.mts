import { write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type CandidateReconciliation = {
  rss_feed_item_id: string
  generation: string
  phase: 'sources' | 'topics'
  cursor_feed_id: string | null
  cursor_topic_id: string | null
  sort_at: Date
  deleted_at: Date | null
}
const NIL = '00000000-0000-0000-0000-000000000000'

export async function getCandidateReconciliation(
  id: string,
  query: QueryExecutor = write,
  lock = false,
): Promise<CandidateReconciliation | undefined> {
  const statement = sql`/* getCandidateReconciliation */
    SELECT work.rss_feed_item_id, work.generation, work.phase, work.cursor_feed_id,
      work.cursor_topic_id, candidate.sort_at, candidate.deleted_at
    FROM rss_feed_item_candidate_reconciliations work
    JOIN rss_feed_item_feed_candidates candidate ON candidate.id = work.rss_feed_item_id
    WHERE work.rss_feed_item_id = ${id} LIMIT 1`
  if (lock) statement.append(' FOR UPDATE OF work')
  return (await query<CandidateReconciliation>(statement)).rows[0]
}

export async function readCandidateReconciliationChildren(
  work: CandidateReconciliation,
  limit: number,
): Promise<string[]> {
  const statement =
    work.phase === 'sources'
      ? sql`/* readCandidateReconciliationSources */
        SELECT rss_feed_id AS id FROM rss_feed_item_sources
        WHERE rss_feed_item_id = ${work.rss_feed_item_id}
          AND rss_feed_id > ${work.cursor_feed_id ?? NIL}::uuid
        ORDER BY rss_feed_id LIMIT ${limit}`
      : sql`/* readCandidateReconciliationTopics */
        SELECT topic_id AS id FROM rss_feed_item_topic_candidates
        WHERE rss_feed_item_id = ${work.rss_feed_item_id}
          AND topic_id > ${work.cursor_topic_id ?? NIL}::uuid
        ORDER BY topic_id LIMIT ${limit}`
  return (await write<{ id: string }>(statement)).rows.map(row => row.id)
}

export async function getCandidateReconciliationUpperBound(): Promise<string | null> {
  const result = await write<{ id: string }>(sql`/* getCandidateReconciliationUpperBound */
    SELECT rss_feed_item_id AS id FROM rss_feed_item_candidate_reconciliations
    ORDER BY rss_feed_item_id DESC LIMIT 1`)
  return result.rows[0]?.id ?? null
}

export async function getCandidateReconciliationPage(input: {
  afterId?: string
  throughId: string
  limit: number
}): Promise<string[]> {
  const result = await write<{ id: string }>(sql`/* getCandidateReconciliationPage */
    SELECT rss_feed_item_id AS id FROM rss_feed_item_candidate_reconciliations
    WHERE rss_feed_item_id > ${input.afterId ?? NIL}::uuid
      AND rss_feed_item_id <= ${input.throughId}::uuid
    ORDER BY rss_feed_item_id LIMIT ${input.limit}`)
  return result.rows.map(row => row.id)
}

export function candidateReconciliationToken(
  work: Pick<
    CandidateReconciliation,
    'generation' | 'phase' | 'cursor_feed_id' | 'cursor_topic_id'
  >,
): string {
  return `${work.generation}_${work.phase}_${work.cursor_feed_id ?? work.cursor_topic_id ?? 'start'}`
}
