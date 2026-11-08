import { beginTransaction, read } from '@data-stores/psql'
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

/** Observe the post-cascade count before deferred user-delete cleanup runs at commit. */
export async function hardDeleteTestUserWithPromptSlotCountObservation(
  userId: string,
): Promise<number | null> {
  await using query = await beginTransaction()
  await query(sql`/* hardDeleteTestUserWithPromptSlotCountObservation */
    DELETE FROM users WHERE id = ${userId}
  `)
  const { rows } = await query<{ allocated_count: number }>(
    sql`/* hardDeleteTestUserWithPromptSlotCountObservation:count */
      SELECT allocated_count FROM community_agent_prompt_slot_counts
      WHERE creator_user_id = ${userId}
    `,
  )
  await query.commit()
  return rows[0]?.allocated_count ?? null
}
