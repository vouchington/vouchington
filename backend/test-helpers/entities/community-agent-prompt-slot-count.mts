import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function readTestCommunityAgentPromptSlotCount(
  userId: string,
): Promise<number | null> {
  const { rows } = await read<{
    allocated_count: number
  }>(sql`/* readTestCommunityAgentPromptSlotCount */
    SELECT allocated_count FROM community_agent_prompt_slot_counts
    WHERE creator_user_id = ${userId}
  `)
  return rows[0]?.allocated_count ?? null
}
