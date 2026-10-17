import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export async function seedViewDrivenPrompts(): Promise<void> {
  const creatorId = seedUuid(0, '01')
  const unpaidCreatorId = seedUuid(5000, '01')
  const users: unknown[] = []
  const agents: unknown[] = []
  const prompts: unknown[] = []
  const slots: unknown[] = []
  const userRows: string[] = []
  const agentRows: string[] = []
  const promptRows: string[] = []
  const slotRows: string[] = []
  for (let index = 0; index < 4; index += 1) {
    const systemUserId = seedUuid(index, '37')
    const agentId = seedUuid(index, '36')
    const promptId = seedUuid(index, '35')
    const promptCreatorId = index === 3 ? unpaidCreatorId : creatorId
    const userOffset = users.push(systemUserId, `seed-view-agent-${index}`)
    userRows.push(`($${userOffset - 1}::uuid, $${userOffset}, 'system')`)
    const agentOffset = agents.push(agentId, systemUserId, promptCreatorId)
    agentRows.push(
      `($${agentOffset - 2}::uuid, $${agentOffset - 1}::uuid, 'moderator', $${agentOffset}::uuid)`,
    )
    const promptOffset = prompts.push(promptId, agentId, promptCreatorId)
    promptRows.push(
      `($${promptOffset - 2}::uuid, $${promptOffset - 1}::uuid, 'Explain prompt', 'gpt-5.4-nano', 'openai', $${promptOffset}::uuid)`,
    )
    const slotOffset = slots.push(
      promptId,
      seedUuid(index === 1 ? 1 : 0, '14'),
      promptCreatorId,
      index,
    )
    slotRows.push(`($${slotOffset - 3}::uuid, $${slotOffset - 2}::uuid, $${slotOffset - 1}::uuid,
      true, CURRENT_TIMESTAMP, CASE WHEN $${slotOffset}::int = 2 THEN CURRENT_TIMESTAMP END)`)
  }

  await using transaction = await beginTransaction()
  await transaction(
    `/* seedViewDrivenPrompts */ INSERT INTO users (id, username, platform_account_kind)
     VALUES ${userRows.join(',')} ON CONFLICT (id) DO NOTHING`,
    users,
  )
  await transaction(
    `/* seedViewDrivenPrompts */ INSERT INTO agents (id, system_user_id, agent_type, created_by_id)
     VALUES ${agentRows.join(',')} ON CONFLICT (id) DO NOTHING`,
    agents,
  )
  await transaction(
    `/* seedViewDrivenPrompts */ INSERT INTO agent_prompts
       (id, agent_id, prompt, model_name, model_provider, created_by_id)
     VALUES ${promptRows.join(',')} ON CONFLICT (id) DO NOTHING`,
    prompts,
  )
  await transaction(
    `/* seedViewDrivenPrompts */ INSERT INTO community_agent_prompts
       (id, community_id, created_by_id, is_slot_allocated, activated_at, deleted_at)
     VALUES ${slotRows.join(',')} ON CONFLICT (id) DO NOTHING`,
    slots,
  )
  await transaction.commit()
}
