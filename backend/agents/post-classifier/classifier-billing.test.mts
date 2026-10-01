import { randomUUID } from 'node:crypto'
import { Response } from 'undici'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  countAiUsageRecordsForResponseId,
  findAiUsageRecordForPost,
  pollUntilNotNull,
} from '@voucha/test-helpers'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import { getAccountingUncertaintySource, OpenAiSpendCapBreachError } from '@services/ai-usage'
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

  describe('a signal that aborts after the provider returned', () => {
    /** `coverage: false` returns the executor a decoded decision that answers no question. */
    async function runAbortingAfterProvider(coverage: boolean, maxAttempts: number) {
      const input = await createPostClassifierExecutionFixture(true, false)
      const responseId = `decision-${randomUUID()}`
      const fetch = vi.fn<StructuredDecisionFetch>(async (_url, init) => {
        const body = JSON.parse(stringFromUnknown(init?.body)) as {
          questions: Record<string, unknown>
        }
        return Response.json(makeBilledOpenRouterResponse(Object.keys(body.questions), responseId))
      })
      const controller = new AbortController()
      const dependencies = createBillingDependencies(input, fetch)
      const createClient = dependencies.createClient
      dependencies.createClient = hooks => {
        const client = createClient(hooks)
        return {
          decide: async (request, signal) => {
            const response = await client.decide(request, signal)
            controller.abort(new Error('worker shutting down'))
            return coverage ? response : { ...response, answers: [] }
          },
        }
      }
      const run = executePostClassifierRun(
        { ...input, maxAttempts, signal: controller.signal },
        dependencies,
      )
      return { input, responseId, fetch, run }
    }

    it('persists the billed decision with one attempt and one billing call', async () => {
      await withReservedAiUsageDay(1_000_000, async () => {
        const { input, responseId, fetch, run } = await runAbortingAfterProvider(true, 3)

        expect(await run).toBe('persisted')
        expect(fetch).toHaveBeenCalledOnce()
        await expect(countAiUsageRecordsForResponseId(responseId)).resolves.toBe(1)
        expect((await getClassifierRunFacts(input.post.id, POST_CLASSIFIER_SLUG))[0]).toMatchObject(
          {
            provider_attempts_started: 1,
            outcomes_persisted_at: expect.any(Date),
            terminal_failed_at: null,
          },
        )
      })
    })

    it('records a post-return failure as invalid-result, never as a provider error', async () => {
      await withReservedAiUsageDay(1_000_000, async () => {
        const { input, responseId, fetch, run } = await runAbortingAfterProvider(false, 1)

        expect(await run).toBe('terminal')
        expect(fetch).toHaveBeenCalledOnce()
        await expect(countAiUsageRecordsForResponseId(responseId)).resolves.toBe(1)
        expect((await getClassifierRunFacts(input.post.id, POST_CLASSIFIER_SLUG))[0]).toMatchObject(
          {
            provider_attempts_started: 1,
            outcomes_persisted_at: null,
            terminal_failure_kind: 'invalid-result',
          },
        )
      })
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
      await expect(
        executePostClassifierRun(
          input,
          createBillingDependencies(input, async () => new Response('', { status: 503 })),
        ),
      ).rejects.toMatchObject({ code: 'provider-error' })
      await expect(getAccountingUncertaintySource(day)).resolves.toBe('unknown_billed_attempt')
    })
  })
})
