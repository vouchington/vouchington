import { it, expect, describe } from 'vitest'
import {
  AGENT_PRIORITY,
  AI_AGENTS_DEFAULTS,
  AI_AGENTS_QUEUE_NAME,
  AI_AGENT_JOB_PRODUCES_SPEND,
  CLASSIFIER_RUN_ATTEMPTS,
  CLASSIFIER_RUN_BACKOFF,
} from './config.mts'

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

  it('sizes the classifier-run backoff for an outage of about an hour, not the shared defaults', () => {
    // 7 waits of delay * 2^(n - 1): 30s, 1m, 2m, 4m, 8m, 16m, 32m.
    const outage = Array.from(
      { length: CLASSIFIER_RUN_ATTEMPTS - 1 },
      (_, index) => CLASSIFIER_RUN_BACKOFF.delay * 2 ** index,
    ).reduce((sum, wait) => sum + wait, 0)
    expect(CLASSIFIER_RUN_ATTEMPTS).toBe(8)
    expect(outage).toBeGreaterThan(60 * 60_000)
    expect(outage).toBeLessThan(65 * 60_000)
    expect(CLASSIFIER_RUN_ATTEMPTS).toBeGreaterThan(AI_AGENTS_DEFAULTS.attempts)
    expect(AI_AGENTS_DEFAULTS).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    })
  })
})
