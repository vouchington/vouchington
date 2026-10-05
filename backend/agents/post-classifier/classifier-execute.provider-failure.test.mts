import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { StructuredDecisionFetch } from '@modules/structured-decisions'
import { claimClassifierRun } from '@services/classifier-runs'
import { describeClassifierProviderFailures } from '@voucha/test-helpers/classifier-provider-failure-tests'
import { getClassifierRunFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import {
  createPostClassifierExecutionFixture,
  initializePostClassifierExecutionTests,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import { getPostClassifierLocalOutcomeFacts } from '@voucha/test-helpers/data-stores/psql/post-classifier/run-facts'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import { POST_CLASSIFIER_SLUG } from '@voucha/types/entities/post-classifier'
import { Response } from 'undici'
import { createPostClassifierOpenRouterClient } from './classifier-client.mts'
import { executePostClassifierRun } from './classifier-execute.mts'

type Fixture = Awaited<ReturnType<typeof createPostClassifierExecutionFixture>>

function dependencies(input: Fixture, fetch: StructuredDecisionFetch, apiKey = 'test-key') {
  return {
    detectLocal: async (
      _text: string,
      { confidenceThreshold }: { confidenceThreshold: number },
    ) => ({
      flagged: true,
      reason: 'Detected',
      confidence_score: 0.99,
      confidence_threshold: confidenceThreshold,
      classification: 'ai' as const,
      detector: 'test-detector',
      detector_model_version: 'test-model',
    }),
    createClient: (hooks: { classifierRunId: string; beforeAttempt: () => Promise<void> }) =>
      createPostClassifierOpenRouterClient(
        {
          postId: input.post.id,
          communityId: input.community.id,
          classifierRunId: hooks.classifierRunId,
          beforeAttempt: hooks.beforeAttempt,
        },
        { apiKey, fetch },
      ),
  }
}

describe('post classifier provider failures (real receipts, real client)', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  afterAll(async () => release?.())

  describeClassifierProviderFailures({
    slug: POST_CLASSIFIER_SLUG,
    async prepare() {
      const input = await createPostClassifierExecutionFixture(true, false)
      let { lease } = input
      return {
        runId: input.run.runId,
        execute: (fetch, { maxAttempts = 3, apiKey } = {}) =>
          executePostClassifierRun(
            { ...input, lease, maxAttempts },
            dependencies(input, fetch, apiKey),
          ),
        claim: async () => {
          const claim = await claimClassifierRun(input.adapter, {
            runId: input.run.runId,
            subject: input.run.subject,
            inputSha256: input.run.inputSha256,
            configurationSha256: input.run.configurationSha256,
            leaseSeconds: 60,
          })
          if (claim.kind === 'claimed') lease = claim.lease
          return claim.kind
        },
        facts: async () => (await getClassifierRunFacts(input.post.id, POST_CLASSIFIER_SLUG))[0]!,
      }
    },
  })

  it('keeps the local outcome when the provider permanently rejects the remote half', async () => {
    await withReservedAiUsageDay(1_000_000, async () => {
      const input = await createPostClassifierExecutionFixture(true, true)
      const fetch = vi.fn<StructuredDecisionFetch>(async () =>
        Response.json(
          { error: { code: 401, message: 'No auth credentials found' } },
          { status: 401 },
        ),
      )

      await expect(executePostClassifierRun(input, dependencies(input, fetch))).resolves.toBe(
        'terminal',
      )

      expect((await getClassifierRunFacts(input.post.id, POST_CLASSIFIER_SLUG))[0]).toMatchObject({
        terminal_failure_kind: 'provider-error',
        provider_attempts_started: 1,
      })
      expect(await getPostClassifierLocalOutcomeFacts(input.run.runId)).toMatchObject({
        is_flagged: true,
        classification: 'ai',
        detector: 'test-detector',
      })
    })
  })
})
