import { sentryCaptureMessageMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { getDayBounds } from '@ts-shared/utils/dates'
import { workerQueueCommandClient } from '@data-stores/valkey-glide-mq'
import { spendCapDelayedRegistryKey } from '@services/ai-usage'
import { moderationAiDispatchConfig } from '@services/moderation-ai-config'
import { cleanUpSpendCapDay, findSpendCapRechecks } from '@voucha/test-helpers/ai-agents-spend-cap'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { startAIAgentWorkerForTest } from '@voucha/test-helpers/ai-agent-worker-lifecycle'
import {
  createAIAgentReportFixture,
  installAIAgentProviderFixtures,
} from '@voucha/test-helpers/ai-agent-worker-fixtures'
import { makeModelCallResult } from '@voucha/test-helpers/agents/model-call-result'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0] || 1)
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})

describe('registered AI worker daily spend cap', () => {
  it('parks a capped job at midnight, records its breach and registers the coordinator', async () => {
    const provider = installAIAgentProviderFixtures()
    const fixture = await createAIAgentReportFixture()
    await withReservedAiUsageDay(0, async day => {
      cleanUpSpendCapDay(day)
      const runtime = await startAIAgentWorkerForTest()
      const outcome = await runtime.run('report-judgement', fixture.data)
      expect(outcome.kind).toBe('delayed')
      expect(provider.generateJson).not.toHaveBeenCalled()
      expect(outcome.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
      expect(
        sentryCaptureMessageMock.mock.calls.filter(
          ([message]) => message === 'ai_spend_cap_breach',
        ),
      ).toHaveLength(1)
      expect(sentryCaptureMessageMock).toHaveBeenCalledWith('ai_spend_cap_breach', {
        level: 'warning',
        tags: {
          reason: 'ai_spend_cap_breach',
          agent_job_name: 'report-judgement',
          breach_reason: 'cap_exceeded',
        },
        extra: { dailyTotalMicrounits: 1, dailyCapMicrounits: 0 },
      })
      await expect(
        workerQueueCommandClient.hget(spendCapDelayedRegistryKey(day), `job:${outcome.job.id}`),
      ).resolves.toBe('marked')
      await expect(findSpendCapRechecks(day)).resolves.toHaveLength(1)
      await runtime.close()
    })
  })

  it('processes an owned report below the daily cap', async () => {
    const provider = installAIAgentProviderFixtures()
    const fixture = await createAIAgentReportFixture()
    provider.json.set(fixture.author.id, [
      makeModelCallResult({
        recommended_action: 'no_action',
        public_response: 'Content looks fine.',
        internal_response: 'No policy violations found.',
      }),
    ])
    await withReservedAiUsageDay(1_000_000, async () => {
      const runtime = await startAIAgentWorkerForTest()
      const outcome = await runtime.run('report-judgement', fixture.data)
      expect(outcome.kind).toBe('completed')
      expect(outcome.result).toEqual({ success: true })
      expect(outcome.moveToDelayed).not.toHaveBeenCalled()
      await runtime.close()
    })
  })

  it.each(['reconcile-auto-dispatch-judgements', 'auto-dispatch-judgement'] as const)(
    'runs exempt %s work during a breach',
    async name => {
      const provider = installAIAgentProviderFixtures()
      const fixture = await createAIAgentReportFixture()
      await moderationAiDispatchConfig.waitForInitialization()
      onTestFinished(
        overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, {
          auto_dispatch_enabled: false,
        }),
      )
      await withReservedAiUsageDay(0, async () => {
        const runtime = await startAIAgentWorkerForTest()
        const outcome = await runtime.run(name, {
          judgement_id: crypto.randomUUID(),
          entity_type: 'post',
          entity_id: fixture.postId,
          community_id: null,
        })
        expect(outcome.kind).toBe('completed')
        expect(outcome.moveToDelayed).not.toHaveBeenCalled()
        expect(provider.generateJson).not.toHaveBeenCalled()
        expect(sentryCaptureMessageMock).not.toHaveBeenCalledWith(
          'ai_spend_cap_breach',
          expect.anything(),
        )
        await runtime.close()
      })
    },
  )
})
