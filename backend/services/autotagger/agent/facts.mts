import type { OwnedTransaction, QueryExecutor } from '@data-stores/psql'
import type { ClassifierRunLease } from '@services/classifier-runs'
import sql from 'sql-template-strings'
import type { AutotaggerAgentRunConfiguration } from './configuration.mts'

/**
 * What the reasoning autotagger found: the captured candidate topics it reported as true of the
 * subject. Facts only: a topic is either reported or not, with no probability, threshold or
 * negative answer, and every id is one of the run's own captured candidates.
 */
export type AutotaggerAgentFacts = { topicIds: readonly string[] }

/** Always valid: a terminal failure retains no facts and a success carries them. */
export function validateAutotaggerAgentFacts(): void {}

/**
 * Retains the reported topics, in the same transaction that marks the outcomes durable. They are
 * selected from the run's own captured candidates, so a reported topic that is not one of them is a
 * bug and fails the transaction.
 */
export async function persistAutotaggerAgentFacts(
  query: OwnedTransaction,
  lease: ClassifierRunLease<AutotaggerAgentRunConfiguration>,
  facts: AutotaggerAgentFacts,
): Promise<void> {
  const reported = [...new Set(facts.topicIds)]
  if (reported.length === 0) return
  const { rowCount } = await query(sql`/* persistAutotaggerAgentFacts */
    INSERT INTO autotagger_agent_run_topics (run_id, topic_id)
    SELECT candidate.run_id, candidate.topic_id FROM classifier_run_candidates candidate
    WHERE candidate.run_id = ${lease.runId} AND candidate.topic_id = ANY(${reported}::uuid[])
  `)
  if (rowCount !== reported.length)
    throw new Error('Agent topic facts include a topic outside the run candidates')
}

export async function readAutotaggerAgentFacts(
  query: QueryExecutor,
  runId: string,
): Promise<AutotaggerAgentFacts> {
  const { rows } = await query<{ topic_id: string }>(sql`/* readAutotaggerAgentFacts */
    SELECT answer.topic_id FROM autotagger_agent_run_topics answer
    JOIN classifier_run_candidates candidate
      ON candidate.run_id = answer.run_id AND candidate.topic_id = answer.topic_id
    WHERE answer.run_id = ${runId} ORDER BY candidate.ordinal
  `)
  return { topicIds: rows.map(row => row.topic_id) }
}
