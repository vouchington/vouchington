import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import { AGENT_PRIORITY } from '@queues/ai-agents/config'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { processAIAgent } from './processors.mts'

describe('processAIAgent routing', () => {
  it('has a switch route for every configured ai-agent queue job name', async () => {
    const source = await readFile(new URL('./processors.mts', import.meta.url), 'utf8')

    for (const name of Object.keys(AGENT_PRIORITY)) {
      expect(source).toContain(`case '${name}':`)
    }
    expect(source).toContain('name satisfies never')
  })

  it('rejects unknown ai-agent queue job names', () => {
    expect(() =>
      processAIAgent({
        name: 'unknown-agent-job',
        data: {},
      } as Job<AIAgentJobData>),
    ).toThrow('Unknown AI agent job: unknown-agent-job')
  })

  it('routes backfill_report_judgements to processBackfillReportJudgements', async () => {
    const result = await processAIAgent({
      name: 'backfill_report_judgements',
      data: {},
    } as Job<AIAgentJobData>)
    // No entities missing judgements in a clean test DB → 0 enqueued
    expect(result).toEqual({ enqueued: expect.any(Number) })
  })

  it('routes auto-dispatch-judgement to processAutoDispatchJudgement (config disabled → no-op)', async () => {
    const result = await processAIAgent({
      name: 'auto-dispatch-judgement',
      data: {
        judgement_id: randomUUID(),
        entity_type: 'post',
        entity_id: randomUUID(),
        community_id: null,
      },
    } as Job<AIAgentJobData>)
    expect(result).toBeUndefined()
  })

  it('routes reconcile-auto-dispatch-judgements to processReconcileAutoDispatchJudgements (config disabled → no-op)', async () => {
    const result = await processAIAgent({
      name: 'reconcile-auto-dispatch-judgements',
      data: {},
    } as Job<AIAgentJobData>)
    expect(result).toBeUndefined()
  })
})
