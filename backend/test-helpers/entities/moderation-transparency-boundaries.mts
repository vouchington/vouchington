import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Sets a CAP deletion half a millisecond after an event to exercise timestamp truncation. */
export async function setTestCommunityAgentPromptDeletedHalfMillisecondAfter(
  promptId: string,
  eventAt: Date,
): Promise<void> {
  await write(sql`/* setTestCommunityAgentPromptDeletedHalfMillisecondAfter */
    UPDATE community_agent_prompts
    SET deleted_at = ${eventAt}::timestamptz + interval '0.5 milliseconds'
    WHERE id = ${promptId}::uuid
  `)
}
