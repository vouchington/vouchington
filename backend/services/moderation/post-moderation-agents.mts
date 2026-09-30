import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AgentModerationStoredResults } from './results.mts'

export async function checkExistingModeration(
  postId: string,
  inputSha256: Buffer,
  promptId: string,
): Promise<{
  post_id: string
  input_sha256: Buffer
  prompt_id: string
  flagged: boolean
} | null> {
  const { rows } = await read<{
    post_id: string
    input_sha256: Buffer
    prompt_id: string
    flagged: boolean
  }>(sql`/* checkExistingModeration */
    SELECT post_id, input_sha256, prompt_id, flagged
    FROM agent_moderations
    WHERE post_id = ${postId}
      AND input_sha256 = ${inputSha256}
      AND prompt_id = ${promptId}
      AND deleted_at IS NULL
    LIMIT 1
  `)
  return rows[0] || null
}

export async function getAlreadyModeratedPromptIds(
  postId: string,
  inputSha256: Buffer,
  promptIds: string[],
): Promise<Set<string>> {
  if (promptIds.length === 0) return new Set()
  const { rows } = await read<{ prompt_id: string }>(sql`/* getAlreadyModeratedPromptIds */
    SELECT DISTINCT prompt_id
    FROM agent_moderations
    WHERE post_id = ${postId}
      AND input_sha256 = ${inputSha256}
      AND prompt_id = ANY(${promptIds}::uuid[])
      AND deleted_at IS NULL
  `)
  return new Set(rows.map((r: { prompt_id: string }) => r.prompt_id))
}

export async function insertAgentModerationResult(
  postId: string,
  inputSha256: Buffer,
  promptId: string,
  agentId: string,
  results: AgentModerationStoredResults,
  flagged: boolean,
): Promise<void> {
  await write(sql`/* insertAgentModerationResult */
    INSERT INTO agent_moderations (post_id, input_sha256, prompt_id, agent_id, results, flagged)
    VALUES (${postId}, ${inputSha256}, ${promptId}, ${agentId}, ${JSON.stringify(results)}::jsonb, ${flagged})
    ON CONFLICT (post_id, input_sha256, prompt_id) DO NOTHING
  `)
}
