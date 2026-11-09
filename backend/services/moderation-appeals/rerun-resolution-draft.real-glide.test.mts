import '@voucha/test-helpers/vitest.setup.sentry-mock'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { ai_agents } from '@queues/ai-agents/queues'
import { disableSpendCapForTest } from '@voucha/test-helpers/ai-agents-spend-cap'
import { startAIAgentWorkerForTest } from '@voucha/test-helpers/ai-agent-worker-lifecycle'
import { installAIAgentProviderFixtures } from '@voucha/test-helpers/ai-agent-worker-fixtures'
import { makeModelCallResult } from '@voucha/test-helpers/agents/model-call-result'
import { admitModerationRerunForTest } from '@voucha/test-helpers/moderation-rerun-worker'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { getModerationAppealByIdFromPrimary } from './get.mts'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0] || 1)
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})

describe('appeal rerun admission when Valkey is unavailable', () => {
  beforeEach(disableSpendCapForTest)

  it('lets the older paid run complete when replacement enqueue fails', async () => {
    const provider = installAIAgentProviderFixtures()
    const admitted = await admitModerationRerunForTest('appeal')
    const appealId = admitted.path.split('/')[4]!
    const originalRunId = (await getModerationAppealByIdFromPrimary(appealId))!
      .ai_draft_requested_run_id
    const entered = Promise.withResolvers<void>()
    const response = Promise.withResolvers<ReturnType<typeof makeModelCallResult>>()
    provider.json.set(admitted.providerKey, [
      () => {
        entered.resolve()
        return response.promise
      },
    ])
    const runtime = await startAIAgentWorkerForTest()
    const completed = Promise.withResolvers<void>()
    runtime.worker.on('completed', (job: Job) => {
      if (job.id === admitted.jobId) completed.resolve()
    })
    await waitForRealGlideEvent(entered.promise, 'older appeal provider entry')

    await ai_agents.close()
    await admitted.request.post(admitted.path).send({}).expect(500)
    expect((await getModerationAppealByIdFromPrimary(appealId))!.ai_draft_requested_run_id).toBe(
      originalRunId,
    )
    expect((await admitted.request.get(admitted.resultPath).expect(200)).body.status).toBe('active')

    response.resolve(
      makeModelCallResult({
        recommended_action: 'deny',
        public_response: 'Original paid run completed',
        internal_response: 'Original paid run completed',
      }),
    )
    await waitForRealGlideEvent(completed.promise, 'older appeal run completion')
    expect(provider.generateJson).toHaveBeenCalledOnce()
    expect((await admitted.request.get(admitted.resultPath).expect(200)).body.status).toBe(
      'succeeded',
    )
  })
})
