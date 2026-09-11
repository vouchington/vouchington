import { it, expect, describe } from 'vitest'
import { AGENT_PRIORITY, AI_AGENTS_QUEUE_NAME } from './config.mts'

describe('config', () => {
  it('chat has highest priority (lowest number)', () => {
    expect(AGENT_PRIORITY['chat']).toBeLessThan(AGENT_PRIORITY['moderation-prompt'])
  })

  it('moderation prompts have higher priority than dispatchers', () => {
    expect(AGENT_PRIORITY['moderation-prompt']).toBeLessThan(
      AGENT_PRIORITY['moderation-dispatcher'],
    )
    expect(AGENT_PRIORITY['community-moderation-prompt']).toBeLessThan(
      AGENT_PRIORITY['community-moderation-dispatcher'],
    )
  })

  it('background agents have lower priority than user-facing agents', () => {
    const userFacing = AGENT_PRIORITY['customer-support']
    const background = AGENT_PRIORITY['wikipedia-recommender']
    expect(userFacing).toBeLessThan(background)
  })

  it('queue name is ai_agents', () => {
    expect(AI_AGENTS_QUEUE_NAME).toBe('ai_agents')
  })

  it('all job names have defined priorities', () => {
    const priorities = Object.values(AGENT_PRIORITY)
    for (const p of priorities) {
      expect(typeof p).toBe('number')
      expect(p).toBeGreaterThan(0)
    }
  })
})
