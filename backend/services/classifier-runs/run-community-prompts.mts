import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Persists the community prompts pinned in a run's configuration, in that order. */
export async function insertClassifierRunCommunityPrompts(
  query: QueryExecutor,
  runId: string,
  promptIds: readonly string[],
): Promise<void> {
  await query(sql`/* insertClassifierRunCommunityPrompts */
    INSERT INTO classifier_run_community_prompts (run_id, community_agent_prompt_id, ordinal)
    SELECT ${runId}, prompt.community_agent_prompt_id, (prompt.ordinal - 1)::int
    FROM unnest(${[...promptIds]}::uuid[]) WITH ORDINALITY
      AS prompt (community_agent_prompt_id, ordinal)
  `)
}
