import { it, expect, describe } from 'vitest'
import { AGENT_PRIORITY, AI_AGENTS_QUEUE_NAME, AI_AGENT_JOB_PRODUCES_SPEND } from './config.mts'

describe('config', () => {
  it('community moderation prompts have higher priority than the dispatcher', () => {
    expect(AGENT_PRIORITY['community-moderation-prompt']).toBeLessThan(
      AGENT_PRIORITY['community-moderation-dispatcher'],
    )
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

  it('the collaborative-only RSS autotagger job never calls a model, so it is spend-free', () => {
    expect(AI_AGENT_JOB_PRODUCES_SPEND['autotagger-rss-feed-item']).toBe(false)
  })
})
