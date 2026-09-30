import { randomUUID } from 'node:crypto'
import { Response } from 'undici'
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest'
import { dynamicConfigPrimaryValkeyClient } from '@data-stores/valkey/clients'
import {
  acquireTestAiUsageDateReservation,
  countAiUsageRecordsForResponseId,
  findAiUsageRecordForPost,
  pollUntilNotNull,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  clearDailyAiCostTotalCacheForTesting,
  getAccountingUncertaintyKey,
  getAccountingUncertaintySource,
  OpenAiSpendCapBreachError,
  openAiSpendCapConfig,
} from '@services/ai-usage'
import { claimClassifierRun } from '@services/classifier-runs'
import type { StructuredDecisionFetch } from '@modules/structured-decisions'
import {
  expireClassifierRunLeaseForTest,
  getClassifierRunFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { POST_CLASSIFIER_SLUG } from '@voucha/types/entities/post-classifier'
import {
  createPostClassifierExecutionFixture,
  initializePostClassifierExecutionTests,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import { createPostClassifierOpenRouterClient } from './classifier-client.mts'
import { executePostClassifierRun } from './classifier-execute.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

type Dependencies = Parameters<typeof executePostClassifierRun>[1]

function makeBilledOpenRouterResponse(ids: readonly string[], responseId: string) {
  return {
    id: responseId,
    model: 'typesafe/jev-1.13-20260917',
    provider: 'TypeSafe',
    usage: { input_tokens: 12, output_tokens: 3, cost: 0.002 },
    answers: ids.map(id => ({ id, type: 'noul', noul: 0.9 })),
  }
}

function createBillingDependencies(
  input: Awaited<ReturnType<typeof createPostClassifierExecutionFixture>>,
  fetch: StructuredDecisionFetch,
): Dependencies {
  return {
    detectLocal: async () => {
      throw new Error('local detector must not run')
    },
    createClient: hooks =>
      createPostClassifierOpenRouterClient(
        {
          postId: input.post.id,
          communityId: input.community.id,
          beforeAttempt: hooks.beforeAttempt,
        },
        { apiKey: 'test-key', fetch },
      ),
  }
}

async function withReservedAiUsageDay<T>(
  dailyCapMicrounits: number,
  fn: (day: string) => Promise<T>,
): Promise<T> {
  await openAiSpendCapConfig.waitForInitialization()
  const reservation = await acquireTestAiUsageDateReservation()
  let released = false
  const release = async () => {
    if (released) return
    released = true
    await reservation.release()
  }
  onTestFinished(release)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${reservation.day}T12:00:00.000Z`))
  clearDailyAiCostTotalCacheForTesting()
  const restore = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, {
    enabled: true,
    daily_cap_microunits: dailyCapMicrounits,
  })
  try {
    return await fn(reservation.day)
  } finally {
    restore()
    clearDailyAiCostTotalCacheForTesting()
    vi.useRealTimers()
    await release()
  }
}

describe('post classifier billing', () => {
  let release: (() => Promise<void>) | undefined

  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })

  afterAll(async () => release?.())

  it('releases a spend-denied admission without dispatching or consuming an attempt', async () => {
    await withReservedAiUsageDay(0, async () => {
      const input = await createPostClassifierExecutionFixture(true, false)
      const fetch = vi.fn<StructuredDecisionFetch>()

      await expect(
        executePostClassifierRun(input, createBillingDependencies(input, fetch)),
      ).rejects.toBeInstanceOf(OpenAiSpendCapBreachError)
      expect(fetch).not.toHaveBeenCalled()
      expect((await getClassifierRunFacts(input.post.id, POST_CLASSIFIER_SLUG))[0]).toMatchObject({
        provider_attempts_started: 0,
        lease_token: null,
      })

      const reclaimed = await claimClassifierRun(input.adapter, {
        runId: input.run.runId,
        subject: input.run.subject,
        inputSha256: input.run.inputSha256,
        configurationSha256: input.run.configurationSha256,
        leaseSeconds: 60,
      })
      expect(reclaimed.kind).toBe('claimed')
    })
  })

  it('records attributed billed usage once when the run replays', async () => {
    await withReservedAiUsageDay(1_000_000, async () => {
      const input = await createPostClassifierExecutionFixture(true, false)
      const responseId = `decision-${randomUUID()}`
      const fetch = vi.fn<StructuredDecisionFetch>(async (_url, init) => {
        const body = JSON.parse(stringFromUnknown(init?.body)) as {
          questions: Record<string, unknown>
        }
        return Response.json(makeBilledOpenRouterResponse(Object.keys(body.questions), responseId))
      })
      const dependencies = createBillingDependencies(input, fetch)

      expect(await executePostClassifierRun(input, dependencies)).toBe('persisted')
      expect(await executePostClassifierRun(input, dependencies)).toBe('replay')
      expect(fetch).toHaveBeenCalledOnce()
      await expect(
        pollUntilNotNull(() => findAiUsageRecordForPost(input.post.id, 'post-classifier')),
      ).resolves.toMatchObject({
        input_tokens: 12,
        output_tokens: 3,
        community_id: input.community.id,
        pricing_status: 'priced',
      })
      await expect(countAiUsageRecordsForResponseId(responseId)).resolves.toBe(1)
    })
  })

  it('never bills again when a reclaimed lease finds the outcomes already durable', async () => {
    await withReservedAiUsageDay(1_000_000, async () => {
      const input = await createPostClassifierExecutionFixture(true, false)
      const responseId = `decision-${randomUUID()}`
      const fetch = vi.fn<StructuredDecisionFetch>(async (_url, init) => {
        const body = JSON.parse(stringFromUnknown(init?.body)) as {
          questions: Record<string, unknown>
        }
        return Response.json(makeBilledOpenRouterResponse(Object.keys(body.questions), responseId))
      })
      const dependencies = createBillingDependencies(input, fetch)
      expect(await executePostClassifierRun(input, dependencies)).toBe('persisted')

      await expireClassifierRunLeaseForTest(input.run.runId)
      const reclaimed = await claimClassifierRun(input.adapter, {
        runId: input.run.runId,
        subject: input.run.subject,
        inputSha256: input.run.inputSha256,
        configurationSha256: input.run.configurationSha256,
        leaseSeconds: 60,
      })
      if (reclaimed.kind !== 'outcomes_ready') throw new Error(`Unexpected: ${reclaimed.kind}`)

      expect(
        await executePostClassifierRun({ ...input, lease: reclaimed.lease }, dependencies),
      ).toBe('replay')
      expect(fetch).toHaveBeenCalledOnce()
      expect((await getClassifierRunFacts(input.post.id, POST_CLASSIFIER_SLUG))[0]).toMatchObject({
        provider_attempts_started: 1,
      })
      await expect(countAiUsageRecordsForResponseId(responseId)).resolves.toBe(1)
    })
  })

  it('records a billed response that fails strict decision decoding', async () => {
    await withReservedAiUsageDay(1_000_000, async () => {
      const input = await createPostClassifierExecutionFixture(true, false)
      const responseId = `decision-${randomUUID()}`
      const fetch = vi.fn<StructuredDecisionFetch>(async () =>
        Response.json(makeBilledOpenRouterResponse([], responseId)),
      )

      await expect(
        executePostClassifierRun(input, createBillingDependencies(input, fetch)),
      ).rejects.toMatchObject({ code: 'invalid-response' })
      await expect(
        pollUntilNotNull(() => findAiUsageRecordForPost(input.post.id, 'post-classifier')),
      ).resolves.toMatchObject({ pricing_status: 'priced', community_id: input.community.id })
      await expect(countAiUsageRecordsForResponseId(responseId)).resolves.toBe(1)
    })
  })

  it('latches an ambiguous billed provider failure', async () => {
    await withReservedAiUsageDay(1_000_000, async day => {
      const input = await createPostClassifierExecutionFixture(true, false)
      const uncertaintyKey = getAccountingUncertaintyKey(day)
      try {
        await expect(
          executePostClassifierRun(
            input,
            createBillingDependencies(input, async () => new Response('', { status: 503 })),
          ),
        ).rejects.toMatchObject({ code: 'provider-error' })
        await expect(getAccountingUncertaintySource(day)).resolves.toBe('unknown_billed_attempt')
      } finally {
        await dynamicConfigPrimaryValkeyClient.unlink([uncertaintyKey])
      }
    })
  })
})
