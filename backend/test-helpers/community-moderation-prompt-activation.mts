import { write } from '../data-stores/psql/index.mts'
import sql from 'sql-template-strings'

export async function setTestCommunityModerationPromptActivatedAt(
  promptId: string,
  activatedAt: Date,
): Promise<void> {
  await write(sql`/* setTestCommunityModerationPromptActivatedAt */
    UPDATE community_agent_prompts
    SET activated_at = ${activatedAt}
    WHERE id = ${promptId}
  `)
}
