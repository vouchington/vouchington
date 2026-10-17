import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export async function seedViewDrivenPrompts(): Promise<void> {
  const creatorId = seedUuid(0, '01')
  const unpaidCreatorId = seedUuid(5000, '01')
  await using transaction = await beginTransaction()
  for (let index = 0; index < 4; index += 1) {
    const systemUserId = seedUuid(index, '37')
    const agentId = seedUuid(index, '36')
    const promptId = seedUuid(index, '35')
    const promptCreatorId = index === 3 ? unpaidCreatorId : creatorId
    await transaction(
      `/* seedViewDrivenPrompts */ INSERT INTO users (id, username, platform_account_kind)
       VALUES ($1::uuid, $2, 'system') ON CONFLICT (id) DO NOTHING`,
      [systemUserId, `seed-view-agent-${index}`],
    )
    await transaction(
      `/* seedViewDrivenPrompts */ INSERT INTO agents (id, system_user_id, agent_type, created_by_id)
       VALUES ($1::uuid, $2::uuid, 'moderator', $3::uuid) ON CONFLICT (id) DO NOTHING`,
      [agentId, systemUserId, promptCreatorId],
    )
    await transaction(
      `/* seedViewDrivenPrompts */ INSERT INTO agent_prompts
         (id, agent_id, prompt, model_name, model_provider, created_by_id)
       VALUES ($1::uuid, $2::uuid, 'Explain prompt', 'gpt-5.4-nano', 'openai', $3::uuid)
       ON CONFLICT (id) DO NOTHING`,
      [promptId, agentId, promptCreatorId],
    )
    await transaction(
      `/* seedViewDrivenPrompts */ INSERT INTO community_agent_prompts
         (id, community_id, created_by_id, is_slot_allocated, activated_at, deleted_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, true, CURRENT_TIMESTAMP,
         CASE WHEN $4::int = 2 THEN CURRENT_TIMESTAMP END)
       ON CONFLICT (id) DO NOTHING`,
      [promptId, seedUuid(index === 1 ? 1 : 0, '14'), promptCreatorId, index],
    )
  }
  await transaction.commit()
}
