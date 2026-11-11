import { write } from '../data-stores/psql/index.mts'
import sql from 'sql-template-strings'

export async function setTestCommunityModerationPromptActivatedAt(
  promptId: string,
  activatedAt: Date | string,
): Promise<void> {
  await write(sql`/* setTestCommunityModerationPromptActivatedAt */
    UPDATE community_agent_prompts
    SET activated_at = ${activatedAt}::timestamptz
    WHERE id = ${promptId}
  `)
}
