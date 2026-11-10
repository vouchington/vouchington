import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { NamedQueueJob } from '@data-stores/valkey-glide-mq'
import type { AIAgentJobPayloads } from '@queues/ai-agents/types'
import { processAIAgent } from './processors.mts'

function runProcessAIAgent(job: unknown) {
  return processAIAgent(job as NamedQueueJob<AIAgentJobPayloads>)
}

describe('processAIAgent routing', () => {
  it('rejects unknown ai-agent queue job names', () => {
    expect(() =>
      runProcessAIAgent({
        name: 'unknown-agent-job',
        data: {},
      }),
    ).toThrow('Unknown AI agent job: unknown-agent-job')
  })

  it('routes backfill_report_judgements to processBackfillReportJudgements', async () => {
    const result = await runProcessAIAgent({
      name: 'backfill_report_judgements',
      data: {},
    })
    // No entities missing judgements in a clean test DB → 0 enqueued
    expect(result).toEqual({ enqueued: expect.any(Number) })
  })

  it('routes auto-dispatch-judgement to processAutoDispatchJudgement (config disabled → no-op)', async () => {
    const result = await runProcessAIAgent({
      name: 'auto-dispatch-judgement',
      data: {
        judgement_id: randomUUID(),
        entity_type: 'post',
        entity_id: randomUUID(),
        community_id: null,
      },
    })
    expect(result).toBeUndefined()
  })

  it('routes reconcile-auto-dispatch-judgements to processReconcileAutoDispatchJudgements (config disabled → no-op)', async () => {
    const result = await runProcessAIAgent({
      name: 'reconcile-auto-dispatch-judgements',
      data: {},
    })
    expect(result).toBeUndefined()
  })

  it('routes reconcile-ai-agent-failures to the bounded failure reconciler', async () => {
    const result = await runProcessAIAgent({ name: 'reconcile-ai-agent-failures', data: {} })
    expect(result).toMatchObject({ scanned: expect.any(Number), hasMore: expect.any(Boolean) })
  })

  it.each(['chat', 'reconcile-chat-runtime-generations'])(
    'rejects the removed hosted-chat job name %s through the unknown-job path',
    name => {
      expect(() => runProcessAIAgent({ name, data: {} })).toThrow(`Unknown AI agent job: ${name}`)
    },
  )

  it.each([
    'moderation-dispatcher',
    'moderation-prompt',
    'community-moderation-dispatcher',
    'community-moderation-prompt',
    'story-clustering',
    'autotagger-post',
  ])('rejects the removed scoring-agent job name %s through the unknown-job path', name => {
    expect(() => runProcessAIAgent({ name, data: {} })).toThrow(`Unknown AI agent job: ${name}`)
  })

  it('treats missing copyright jobs as successful idempotent queue replays', async () => {
    const missing = '00000000-0000-7000-8000-000000000091'

    await expect(
      runProcessAIAgent({
        name: 'copyright-email-intake',
        data: { intake_id: missing },
      }),
    ).resolves.toEqual({ success: true })
    await expect(
      runProcessAIAgent({
        name: 'copyright-form-screening',
        data: { submission_id: missing },
      }),
    ).resolves.toEqual({ success: true })
    await expect(
      runProcessAIAgent({
        name: 'copyright-appeal-recommendation',
        data: { submission_id: missing },
      }),
    ).resolves.toEqual({ success: true })
  })
})
