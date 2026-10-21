import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { NormalizedClassifierDecisionInput } from './decision-input.mts'
import type { PersistedClassifierDecision } from './types.mts'

/** Missing IDs remain validation/FK errors; only existing inactive topics are obsolete work. */
export async function readInactiveClassifierTopicIds(
  query: QueryExecutor,
  topicIds: readonly string[],
): Promise<ReadonlySet<string>> {
  if (topicIds.length === 0) return new Set()
  const { rows } = await query<{ id: string; inactive: boolean }>(
    // no-mistakes-disable-next-line postgres-required-predicates: lifecycle classification must include inactive identities
    sql`/* readInactiveClassifierTopicIds */ SELECT id,
      deleted_at IS NOT NULL OR merged_into_topic_id IS NOT NULL AS inactive
      FROM topics WHERE id = ANY(${[...topicIds]}::uuid[]) ORDER BY id FOR SHARE`,
  )
  return new Set(rows.flatMap(row => (row.inactive ? [row.id] : [])))
}

export function omitInactiveTopicInput(
  input: NormalizedClassifierDecisionInput,
  inactive: ReadonlySet<string>,
): NormalizedClassifierDecisionInput {
  return {
    ...input,
    calls: input.calls.map(call => ({
      ...call,
      results: call.results.filter(
        result => result.candidateKind !== 'topic' || !inactive.has(result.topicId),
      ),
    })),
  }
}

export function omitInactiveTopicDecision(
  decision: PersistedClassifierDecision,
  inactive: ReadonlySet<string>,
): PersistedClassifierDecision {
  return {
    ...decision,
    results: decision.results.filter(
      result => result.candidateKind !== 'topic' || !inactive.has(result.topicId),
    ),
  }
}
