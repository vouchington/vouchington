/**
 * Post LLM moderation prompts entity helpers
 */

import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Insert a test agent prompt for the given agent
 */
export async function insertTestAgentPrompt(options: {
  agentId: string
  prompt?: string
  activated?: boolean
}): Promise<string> {
  const prompt = options.prompt ?? 'Test moderation prompt'
  const activatedAt = options.activated === false ? null : new Date()

  const { rows } = await write(
    sql`/* insertTestAgentPrompt */
    INSERT INTO agent_prompts (agent_id, prompt, model_name, model_provider, activated_at)
    VALUES (
      ${options.agentId},
      ${prompt},
      'gpt-5.4-nano',
      'openai',
      ${activatedAt}
    )
    RETURNING id
  `,
  )
  return rows[0].id as string
}

/** Sets prompt lifecycle time exactly, including restoring a previously deleted prompt. */
export async function setTestModerationPromptDeletedAt(
  promptId: string,
  deletedAt: Date | null,
): Promise<void> {
  await write(sql`/* setTestModerationPromptDeletedAt */
    UPDATE agent_prompts
    SET deleted_at = ${deletedAt}
    WHERE id = ${promptId}::uuid
  `)
}

/** Sets an active prompt's sort timestamp to a deterministic test fixture value. */
export async function setTestModerationPromptActivatedAt(
  promptId: string,
  activatedAt: Date,
): Promise<void> {
  await write(sql`/* setTestModerationPromptActivatedAt */
    UPDATE agent_prompts
    SET activated_at = ${activatedAt}, deactivated_at = NULL
    WHERE id = ${promptId}::uuid
  `)
}

/** Sets a deletion half a millisecond after an event to exercise timestamp truncation. */
export async function setTestModerationPromptDeletedHalfMillisecondAfter(
  promptId: string,
  eventAt: Date,
): Promise<void> {
  await write(sql`/* setTestModerationPromptDeletedHalfMillisecondAfter */
    UPDATE agent_prompts
    SET deleted_at = ${eventAt}::timestamptz + interval '0.5 milliseconds'
    WHERE id = ${promptId}::uuid
  `)
}

/** Hard-deletes a prompt to exercise cascading source-row trigger maintenance. */
export async function hardDeleteTestModerationPrompt(promptId: string): Promise<void> {
  await write(sql`/* hardDeleteTestModerationPrompt */
    DELETE FROM agent_prompts
    WHERE id = ${promptId}::uuid
  `)
}

/**
 * Get active LLM moderation prompts (excluding specific IDs)
 */
export async function getActiveLLMModerationPromptsExcluding(
  excludeIds: string[],
): Promise<unknown[]> {
  if (excludeIds.length === 0) {
    const { rows } = await read(
      sql`/* getActiveLLMModerationPromptsExcludingEmpty */
      SELECT id
      FROM agent_prompts
      WHERE activated_at IS NOT NULL
        AND deactivated_at IS NULL
    `,
    )
    return rows
  }

  const { rows } = await read(
    sql`/* getActiveLLMModerationPromptsExcludingIds */
    SELECT id
    FROM agent_prompts
    WHERE activated_at IS NOT NULL
      AND deactivated_at IS NULL
      AND id != ALL(${excludeIds})
  `,
  )
  return rows
}
