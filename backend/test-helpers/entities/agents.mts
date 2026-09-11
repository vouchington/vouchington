import { write, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUserDirect } from './users.mts'
import { createRandomString } from '../data.mts'
import type { AgentModel, AgentModelProvider } from '@voucha/types/entities/agent-model'

// Local copy of @services/agents' AgentPrompt row shape — that service's prompt INSERT/UPDATE
// queries have no side effects, reimplemented below as raw-primitive direct calls (this package
// must never depend on a service that already devDeps this package for its own tests). Keep in
// sync with backend/services/agents/types.mts.
type TestAgentPrompt = {
  id: string
  prompt: string
  agent_id: string
  model_name: AgentModel
  model_provider: AgentModelProvider
  created_at: Date
  updated_at: Date
  activated_at: Date | null
  deactivated_at: Date | null
  deleted_at: Date | null
}

async function createTestAgentPrompt(
  agentId: string,
  prompt: string,
  modelName: AgentModel,
  modelProvider: AgentModelProvider,
): Promise<TestAgentPrompt> {
  const { rows } = await write<TestAgentPrompt>(sql`/* createTestAgentPrompt */
    INSERT INTO agent_prompts (agent_id, prompt, model_name, model_provider)
    VALUES (${agentId}, ${prompt}, ${modelName}, ${modelProvider})
    RETURNING
      id, prompt, agent_id, model_name, model_provider,
      created_at, updated_at, activated_at, deactivated_at, deleted_at
  `)
  return rows[0]!
}

async function activateTestAgentPrompt(promptId: string): Promise<TestAgentPrompt> {
  const { rows } = await write<TestAgentPrompt>(sql`/* activateTestAgentPrompt */
    UPDATE agent_prompts
    SET activated_at = CURRENT_TIMESTAMP,
        deactivated_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${promptId}
    RETURNING
      id, prompt, agent_id, model_name, model_provider,
      created_at, updated_at, activated_at, deactivated_at, deleted_at
  `)
  return rows[0]!
}

type CreateTestAgentOptions = {
  agentType?: 'moderator' | 'autotagger'
  slug?: string
  activated?: boolean
}

export async function createTestAgent(options: CreateTestAgentOptions = {}) {
  const agentType = options.agentType ?? 'moderator'
  const random = createRandomString(10)

  // Create a system user for the agent
  const systemUser = await createTestUserDirect({
    username: `agent-${random}`,
  })
  if (!systemUser) throw new Error('Failed to create agent system user')

  // Insert into agents table
  const { rows } = await write(sql`
    INSERT INTO agents (system_user_id, agent_type)
    VALUES (${systemUser.id}, ${agentType})
    RETURNING id, system_user_id, agent_type, activated_at, deactivated_at, created_at, updated_at, deleted_at
  `)
  const agent = rows[0]

  // If moderator, insert into agents__moderators
  if (agentType === 'moderator') {
    const slug = options.slug ?? `mod-${random}`
    await write(sql`
      INSERT INTO agents__moderators (agent_id, slug)
      VALUES (${agent.id}, ${slug})
    `)
    agent.slug = slug
  }

  // If activated, set activated_at
  if (options.activated) {
    await write(sql`
      UPDATE agents SET activated_at = CURRENT_TIMESTAMP WHERE id = ${agent.id}
    `)
    agent.activated_at = new Date()
  }

  return {
    id: agent.id as string,
    system_user_id: agent.system_user_id as string,
    agent_type: agent.agent_type as string,
    slug: agent.slug as string | undefined,
  }
}

/**
 * Sets up the autotagger system user, agent, and an active prompt for testing.
 * User and agent are upserted (safe to call multiple times). A fresh prompt is
 * always created and activated so the caller gets a known-good prompt id.
 */
export async function setupTestAutotaggerAgent(): Promise<TestAgentPrompt> {
  // Upsert autotagger system user. is_system = TRUE so getSystemUserByUsername('autotagger')
  // (is_system-gated to close the reserved-username squatting vector) resolves this fixture.
  const { rows: userRows } = await write(sql`
    INSERT INTO users (username, is_system)
    VALUES ('autotagger', TRUE)
    ON CONFLICT ((LOWER(username))) WHERE username IS NOT NULL
    DO UPDATE SET username = EXCLUDED.username, is_system = TRUE
    WHERE users.is_system = TRUE
    RETURNING id
  `)
  const autotaggerUserId = userRows[0].id as string

  // Get existing agent (including soft-deleted) or create a new one
  const { rows: existingAgentRows } = await read(sql`
    SELECT id, deleted_at FROM agents WHERE system_user_id = ${autotaggerUserId} LIMIT 1
  `)
  let agentId: string
  if (existingAgentRows.length > 0) {
    agentId = existingAgentRows[0].id as string
    // Restore soft-deleted agents
    if (existingAgentRows[0].deleted_at) {
      await write(sql`UPDATE agents SET deleted_at = NULL WHERE id = ${agentId}`)
    }
  } else {
    const { rows: newAgentRows } = await write(sql`
      INSERT INTO agents (system_user_id, agent_type)
      VALUES (${autotaggerUserId}, 'autotagger')
      RETURNING id
    `)
    agentId = newAgentRows[0].id as string
  }

  // Create a fresh activated prompt (most recent is used by getActiveAutotaggerPrompt)
  const prompt = await createTestAgentPrompt(agentId, 'Test prompt', 'gpt-5.4-nano', 'openai')
  return activateTestAgentPrompt(prompt.id)
}

/** Sets agent lifecycle time exactly, including restoring a previously deleted agent. */
export async function setTestAgentDeletedAt(
  agentId: string,
  deletedAt: Date | null,
): Promise<void> {
  await write(sql`/* setTestAgentDeletedAt */
    UPDATE agents
    SET deleted_at = ${deletedAt}
    WHERE id = ${agentId}::uuid
  `)
}

/** Sets a deletion half a millisecond after an event to exercise timestamp truncation. */
export async function setTestAgentDeletedHalfMillisecondAfter(
  agentId: string,
  eventAt: Date,
): Promise<void> {
  await write(sql`/* setTestAgentDeletedHalfMillisecondAfter */
    UPDATE agents
    SET deleted_at = ${eventAt}::timestamptz + interval '0.5 milliseconds'
    WHERE id = ${agentId}::uuid
  `)
}
