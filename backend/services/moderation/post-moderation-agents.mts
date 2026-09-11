import type { ActiveModeratorConfig } from './moderation-prompts.mts'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AgentModerationStoredResults } from './results.mts'

export async function hasPostModerationAgent(
  postId: string,
  inputSha256: Buffer,
  promptId: string,
): Promise<boolean> {
  const { rows } = await read(sql`/* hasPostModerationAgent */
    SELECT 1
    FROM agent_moderations
    WHERE post_id = ${postId}
      AND input_sha256 = ${inputSha256}
      AND prompt_id = ${promptId}
      AND deleted_at IS NULL
    LIMIT 1
  `)
  return rows.length > 0
}

export async function getModeratorConfig(
  moderatorSlug: string,
  promptId?: string,
): Promise<ActiveModeratorConfig | null> {
  const query = sql`/* getModeratorConfig */
    SELECT DISTINCT ON (a.id)
      a.id as moderator_id,
      am.slug as moderator_slug,
      am.on_flag_action,
      am.is_baseline,
      a.system_user_id,
      json_build_object(
        'id', p.id,
        'prompt', p.prompt,
        'model_name', p.model_name,
        'model_provider', p.model_provider
      ) as prompt
    FROM agents a
    INNER JOIN agents__moderators am ON am.agent_id = a.id
    INNER JOIN agent_prompts p ON p.agent_id = a.id
    WHERE am.slug = ${moderatorSlug}
      AND a.agent_type = 'moderator'
      AND a.activated_at IS NOT NULL
      AND a.deactivated_at IS NULL
      AND a.deleted_at IS NULL
      AND p.activated_at IS NOT NULL
      AND p.deactivated_at IS NULL
      AND p.deleted_at IS NULL
  `

  if (promptId) {
    query.append(sql` AND p.id = ${promptId} `)
  }

  query.append(sql` ORDER BY a.id, p.activated_at DESC, p.id DESC LIMIT 1`)

  const { rows } = await read(query)
  return rows[0] || null
}

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
  const { rows } = await read(sql`/* checkExistingModeration */
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

export async function getPostModeratorsNeedingRun(
  postId: string,
  inputSha256: Buffer,
  moderatorConfigs: ActiveModeratorConfig[],
): Promise<ActiveModeratorConfig[]> {
  if (moderatorConfigs.length === 0) return []

  const promptIds = moderatorConfigs.map(c => c.prompt.id)

  // Single query to check existing moderations
  const { rows } = await read(sql`/* getPostModeratorsNeedingRun */
    SELECT DISTINCT prompt_id
    FROM agent_moderations
    WHERE post_id = ${postId}
      AND input_sha256 = ${inputSha256}
      AND prompt_id = ANY(${promptIds})
      AND deleted_at IS NULL
  `)

  const existingPromptIds = new Set(rows.map(r => r.prompt_id))

  // Return only moderators that haven't run on this content
  return moderatorConfigs.filter(config => !existingPromptIds.has(config.prompt.id))
}

export async function getAlreadyModeratedPromptIds(
  postId: string,
  inputSha256: Buffer,
  promptIds: string[],
): Promise<Set<string>> {
  if (promptIds.length === 0) return new Set()
  const { rows } = await read(sql`/* getAlreadyModeratedPromptIds */
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

export async function insertPostModerationAgent(
  postId: string,
  inputSha256: Buffer,
  promptId: string,
  moderatorId: string,
  results: AgentModerationStoredResults,
  flagged: boolean,
): Promise<{
  post_id: string
  input_sha256: Buffer
  prompt_id: string
} | null> {
  const { rows } = await write(sql`/* insertPostModerationAgent */
    INSERT INTO agent_moderations (post_id, input_sha256, prompt_id, agent_id, results, flagged)
    SELECT ${postId}, ${inputSha256}, ${promptId}, ${moderatorId}, ${JSON.stringify(results)}::jsonb, ${flagged}
    WHERE EXISTS (
      SELECT 1
      FROM posts
      WHERE id = ${postId}
        AND llm_moderation_content_sha256 = ${inputSha256}
    )
    RETURNING post_id, input_sha256, prompt_id
  `)
  if (rows.length === 0) {
    return null
  }
  return rows[0]
}
