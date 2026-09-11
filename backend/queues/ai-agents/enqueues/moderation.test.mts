import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { enqueueBulkModerationPrompts } from './moderation.mts'
import { AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'

describe('enqueueBulkModerationPrompts', () => {
  it('resolves after moderation prompt jobs are queued with retry and dedupe options', async () => {
    const postId = randomUUID()
    const moderatorSlug = `self-promotion-${randomUUID()}`

    await enqueueBulkModerationPrompts([{ postId, moderatorSlug }])

    const waiting = (await readAllQueueJobs(ai_agents)) as Array<{
      name: string
      data: { id?: string; moderatorSlug?: string }
      opts: unknown
    }>
    const job = waiting.find(j => j.name === 'moderation-prompt' && j.data.id === postId)
    expect(job).toBeDefined()
    expect(job!.data).toEqual({ id: postId, moderatorSlug })
    // The dispatcher-level test covers fan-out; this helper test owns queue option shape.
    expect(job!.opts).toMatchObject({
      attempts: AI_AGENTS_DEFAULTS.attempts,
      backoff: AI_AGENTS_DEFAULTS.backoff,
      priority: AGENT_PRIORITY['moderation-prompt'],
      removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
      removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
      deduplication: {
        id: `moderation_prompt_${postId}_${moderatorSlug}`,
        mode: 'debounce',
        ttl: 60_000,
      },
    })
  })
})
