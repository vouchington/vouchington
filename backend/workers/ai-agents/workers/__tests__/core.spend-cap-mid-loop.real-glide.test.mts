import { sentryCaptureMessageMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { RateLimitError } from 'openai'
import { Responses } from 'openai/resources/responses/responses'
import { workerQueueCommandClient } from '@data-stores/valkey-glide-mq'
import {
  modelRoutingConfig,
  refreshDailyAiCostTotalMicrounits,
  spendCapDelayedRegistryKey,
} from '@services/ai-usage'
import { getDayBounds } from '@ts-shared/utils/dates'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import { cleanUpSpendCapDay } from '@voucha/test-helpers/ai-agents-spend-cap'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { insertTestAiUsageRecord } from '@voucha/test-helpers/entities/ai-usage'
import { makeFlexCapacityFailedStream } from '@voucha/test-helpers/modules/openai-utils/responses'
import { startAIAgentWorkerForTest } from '@voucha/test-helpers/ai-agent-worker-lifecycle'
import {
  createAIAgentReportFixture,
  installAIAgentProviderFixtures,
  withAIAgentProviderNetworkFence,
} from '@voucha/test-helpers/ai-agent-worker-fixtures'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0] || 1)
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})

describe('registered AI worker spend-cap admission after dispatch', () => {
  it('parks a job at midnight when the actual flex-fallback recheck finds newly recorded spend', async () => {
    const provider = installAIAgentProviderFixtures()
    provider.generateJson.mockRestore()
    const fixture = await createAIAgentReportFixture()
    await modelRoutingConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(modelRoutingConfig, {
        report_judgement_provider: 'openai',
        report_judgement_model: 'gpt-6-luna',
        openai_transport: 'direct',
      }),
    )
    const priorKey = process.env.OPENAI_API_KEY
    vi.stubEnv('OPENAI_API_KEY', 'spend-cap-provider-fixture')
    const create = vi
      .spyOn(Responses.prototype, 'create')
      .mockRejectedValue(new Error('Unexpected paid provider request'))
    try {
      await withAIAgentProviderNetworkFence(async () => {
        await withReservedAiUsageDay(10_000_000, async day => {
          cleanUpSpendCapDay(day)
          create.mockImplementationOnce(() => {
            const response = (async () => {
              await insertTestAiUsageRecord({
                id: timestampToUuidv7LowerBound(Date.now()),
                costMicrounits: 12_000_000,
              })
              await refreshDailyAiCostTotalMicrounits()
              return makeFlexCapacityFailedStream()
            })()
            return response as unknown as ReturnType<Responses['create']>
          })
          const runtime = await startAIAgentWorkerForTest()
          try {
            const outcome = await runtime.run('report-judgement', fixture.data)
            expect(outcome.kind).toBe('delayed')
            expect(create).toHaveBeenCalledOnce()
            expect(outcome.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
            await expect(
              workerQueueCommandClient.hget(
                spendCapDelayedRegistryKey(day),
                `job:${outcome.job.id}`,
              ),
            ).resolves.toBe('marked')
            expect(
              sentryCaptureMessageMock.mock.calls.filter(
                ([message]) => message === 'ai_spend_cap_breach',
              ),
            ).toHaveLength(1)
          } finally {
            await runtime.close()
          }
        })
      })
    } finally {
      create.mockRestore()
      vi.stubEnv('OPENAI_API_KEY', priorKey)
    }
  })

  it('parks a raw OpenAI SDK rate limit for thirty seconds rather than at midnight', async () => {
    const provider = installAIAgentProviderFixtures()
    const fixture = await createAIAgentReportFixture()
    provider.json.set(fixture.author.id, [
      new RateLimitError(429, {}, 'rate limited', new Headers({ 'retry-after': '30' })),
    ])
    await withReservedAiUsageDay(10_000_000, async day => {
      cleanUpSpendCapDay(day)
      const runtime = await startAIAgentWorkerForTest()
      const outcome = await runtime.run('report-judgement', fixture.data)
      expect(outcome.kind).toBe('delayed')
      expect(outcome.moveToDelayed).toHaveBeenCalledExactlyOnceWith(Date.now() + 30_000)
      await expect(
        workerQueueCommandClient.hget(spendCapDelayedRegistryKey(day), `job:${outcome.job.id}`),
      ).resolves.toBeNull()
      await runtime.close()
    })
  })
})
