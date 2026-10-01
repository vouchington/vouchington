import { randomUUID } from 'node:crypto'
import { Response } from 'undici'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  StructuredDecisionError,
  createStructuredDecisionClient,
  type StructuredDecisionRequest,
  type StructuredDecisionResult,
} from '@modules/structured-decisions'
import { createPostModerationContent } from '@services/posts/content'
import {
  readClassifierRunOutcomes,
  startClassifierProviderAttempt,
} from '@services/classifier-runs'
import { getClassifierRunFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { getPostClassifierLocalOutcomeFacts } from '@voucha/test-helpers/data-stores/psql/post-classifier/run-facts'
import { POST_CLASSIFIER_SLUG } from '@voucha/types/entities/post-classifier'
import { getClassifierBorrowedDecisionFacts } from '@voucha/test-helpers/data-stores/psql/classifier-borrowed-transactions'
import { setPostClassifierToggleForTest } from '@voucha/test-helpers/entities/post-classifier-toggles'
import {
  initializePostClassifierExecutionTests,
  createPostClassifierExecutionFixture,
  makePostClassifierResponse,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import { executePostClassifierRun } from './classifier-execute.mts'

type Dependencies = Parameters<typeof executePostClassifierRun>[1]
function makeDependencies(
  respond?: (
    request: StructuredDecisionRequest,
    signal?: AbortSignal,
  ) => Promise<StructuredDecisionResult>,
) {
  const calls = { factories: 0, requests: 0, detector: [] as { text: string; threshold: number }[] }
  const dependencies: Dependencies = {
    detectLocal: async (text, { confidenceThreshold }) => {
      calls.detector.push({ text, threshold: confidenceThreshold })
      return {
        flagged: true,
        reason: 'Detected',
        confidence_score: 0.99,
        confidence_threshold: confidenceThreshold,
        classification: 'ai',
        detector: 'test-detector',
        detector_model_version: 'test-model',
      }
    },
    createClient: hooks => {
      calls.factories++
      return {
        decide: async (request, signal) => {
          signal?.throwIfAborted()
          await hooks.beforeAttempt()
          signal?.throwIfAborted()
          calls.requests++
          return respond
            ? respond(request, signal)
            : makePostClassifierResponse(request.questions.map(question => question.id))
        },
      }
    },
  }
  return { calls, dependencies }
}

describe('post classifier execution with real receipts', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  afterAll(async () => release?.())
  it('persists mixed outcomes and replays without calls', async () => {
    const input = await createPostClassifierExecutionFixture()
    const { calls, dependencies } = makeDependencies()
    expect(await executePostClassifierRun(input, dependencies)).toBe('persisted')
    expect(await executePostClassifierRun(input, dependencies)).toBe('replay')
    expect(calls.requests).toBe(1)
    expect(calls.factories).toBe(1)
    const content = createPostModerationContent(input.post)
    expect(calls.detector).toEqual([
      {
        text: [content.title, content.markdown].filter(Boolean).join('\n\n'),
        threshold: input.lease.resolved.configuration.local!.confidenceThreshold,
      },
    ])
    expect(await readClassifierRunOutcomes(input.adapter, input.lease)).toMatchObject({
      local: { flagged: true },
      remoteDecision: { batchId: input.lease.decisionBatchId },
    })
    expect((await getClassifierRunFacts(input.post.id, POST_CLASSIFIER_SLUG))[0]).toMatchObject({
      provider_attempts_started: 1,
      outcomes_persisted_at: expect.any(Date),
      completed_at: null,
    })
  })
  it.each([
    [false, true],
    [true, false],
  ])('runs remote=%s local=%s without the disabled dependency', async (remote, local) => {
    const input = await createPostClassifierExecutionFixture(remote, local)
    const { calls, dependencies } = makeDependencies()
    if (!remote)
      dependencies.createClient = () => {
        throw new Error('must not access credentials')
      }
    if (!local)
      dependencies.detectLocal = async () => {
        throw new Error('must not run detector')
      }
    expect(await executePostClassifierRun(input, dependencies)).toBe('persisted')
    expect(calls.requests).toBe(Number(remote))
    expect(calls.detector).toHaveLength(Number(local))
    expect(
      (await getClassifierRunFacts(input.post.id, POST_CLASSIFIER_SLUG))[0]
        ?.provider_attempts_started,
    ).toBe(Number(remote))
  })
  it('rejects stale post identity and hash before work', async () => {
    const input = await createPostClassifierExecutionFixture()
    const { calls, dependencies } = makeDependencies()
    expect(
      await executePostClassifierRun(
        { ...input, post: { ...input.post, id: randomUUID() } },
        dependencies,
      ),
    ).toBe('stale')
    expect(
      await executePostClassifierRun(
        { ...input, lease: { ...input.lease, inputSha256: Buffer.alloc(32) } },
        dependencies,
      ),
    ).toBe('stale')
    expect(calls).toEqual({ factories: 0, requests: 0, detector: [] })
  })
  it('discards both outcomes when configuration changes during dispatch', async () => {
    const input = await createPostClassifierExecutionFixture()
    const { dependencies } = makeDependencies(async request => {
      await setPostClassifierToggleForTest(input.community.id, 'self-promotion', false)
      return makePostClassifierResponse(request.questions.map(question => question.id))
    })
    expect(await executePostClassifierRun(input, dependencies)).toBe('stale')
    expect(await readClassifierRunOutcomes(input.adapter, input.lease)).toBeNull()
    await expectReservedRemoteBatch(input)
  })
  it.each(['missing', 'provider', 'timeout'] as const)(
    'releases %s failures without partial outcomes',
    async kind => {
      const input = await createPostClassifierExecutionFixture()
      const controller = new AbortController()
      const { dependencies } = makeDependencies(async () => {
        if (kind === 'provider')
          throw new StructuredDecisionError('provider-error', 'provider failed', 503)
        if (kind === 'timeout') {
          controller.abort(new Error('request timed out'))
          throw controller.signal.reason
        }
        return makePostClassifierResponse([])
      })
      await expect(
        executePostClassifierRun({ ...input, signal: controller.signal }, dependencies),
      ).rejects.toThrow(
        kind === 'missing'
          ? 'every requested question'
          : kind === 'provider'
            ? 'provider failed'
            : 'request timed out',
      )
      expect(await readClassifierRunOutcomes(input.adapter, input.lease)).toBeNull()
      expect((await getClassifierRunFacts(input.post.id, POST_CLASSIFIER_SLUG))[0]).toMatchObject({
        lease_token: null,
        provider_attempts_started: 1,
        terminal_failed_at: null,
      })
      await expectReservedRemoteBatch(input)
    },
  )
  it('stops at the attempt budget before another request', async () => {
    const input = await createPostClassifierExecutionFixture(true, false)
    expect(
      await startClassifierProviderAttempt(input.adapter, { lease: input.lease, maxAttempts: 1 }),
    ).toBe('started')
    const { calls, dependencies } = makeDependencies()
    expect(await executePostClassifierRun({ ...input, maxAttempts: 1 }, dependencies)).toBe(
      'terminal',
    )
    expect(calls.requests).toBe(0)
    expect(
      (await getClassifierRunFacts(input.post.id, POST_CLASSIFIER_SLUG))[0]?.terminal_failed_at,
    ).toBeInstanceOf(Date)
  })
  it('keeps persistence validation errors out of provider failure accounting', async () => {
    const input = await createPostClassifierExecutionFixture()
    const { dependencies } = makeDependencies()
    const detect = dependencies.detectLocal
    dependencies.detectLocal = async (text, options) => ({
      ...(await detect(text, options)),
      confidence_threshold: 0,
    })
    await expect(executePostClassifierRun(input, dependencies)).rejects.toThrow(
      'local outcome does not match',
    )
    expect((await getClassifierRunFacts(input.post.id, POST_CLASSIFIER_SLUG))[0]).toMatchObject({
      lease_token: input.lease.leaseToken,
      provider_attempts_started: 1,
      outcomes_persisted_at: null,
      terminal_failed_at: null,
    })
  })
  it.each([false, true])('does not perform aborted work (remote=%s)', async remote => {
    const input = await createPostClassifierExecutionFixture(remote)
    const { calls, dependencies } = makeDependencies()
    await expect(
      executePostClassifierRun(
        { ...input, signal: AbortSignal.abort(new Error('cancelled')) },
        dependencies,
      ),
    ).rejects.toThrow('cancelled')
    expect(calls.detector).toEqual([])
    expect(await readClassifierRunOutcomes(input.adapter, input.lease)).toBeNull()
  })

  it.each(['decode', 'terminal'] as const)('uses real C1 %s failure boundaries', async kind => {
    const input = await createPostClassifierExecutionFixture(true, false)
    const { dependencies } = makeDependencies()
    let fetches = 0
    dependencies.createClient = hooks =>
      createStructuredDecisionClient({
        transport: 'openrouter',
        apiKey: 'test-key',
        hooks,
        fetch: async () => {
          fetches++
          return kind === 'terminal' ? new Response('', { status: 503 }) : Response.json({})
        },
      })
    const settled = await executePostClassifierRun(
      { ...input, maxAttempts: kind === 'terminal' ? 1 : 3 },
      dependencies,
    ).then(
      result => ({ result }),
      (error: unknown) => ({ error }),
    )
    expect(settled).toEqual(
      {
        decode: { error: expect.objectContaining({ code: 'invalid-response' }) },
        terminal: { result: 'terminal' },
      }[kind],
    )
    expect(fetches).toBe(1)
    const row = (await getClassifierRunFacts(input.post.id, POST_CLASSIFIER_SLUG))[0]!
    expect(row.provider_attempts_started).toBe(1)
    expect(row.lease_token).toBeNull()
    expect(row.terminal_failed_at !== null).toBe(kind === 'terminal')
    expect(row.outcomes_persisted_at).toBeNull()
    await expectReservedRemoteBatch(input)
  })

  it('keeps the local detector outcome when the provider ends the run', async () => {
    const input = await createPostClassifierExecutionFixture(true, true)
    const { calls, dependencies } = makeDependencies()
    dependencies.createClient = hooks =>
      createStructuredDecisionClient({
        transport: 'openrouter',
        apiKey: 'test-key',
        hooks,
        fetch: async () => new Response('', { status: 503 }),
      })

    expect(await executePostClassifierRun({ ...input, maxAttempts: 1 }, dependencies)).toBe(
      'terminal',
    )

    expect((await getClassifierRunFacts(input.post.id, POST_CLASSIFIER_SLUG))[0]).toMatchObject({
      terminal_failure_kind: 'provider-error',
      outcomes_persisted_at: null,
    })
    expect(calls.detector).toHaveLength(1)
    expect(await getPostClassifierLocalOutcomeFacts(input.run.runId)).toMatchObject({
      flagged: true,
      detector: 'test-detector',
    })
  })
})

async function expectReservedRemoteBatch(
  input: Awaited<ReturnType<typeof createPostClassifierExecutionFixture>>,
): Promise<void> {
  const remote = input.lease.resolved.configuration.remote
  if (!remote || !input.lease.decisionBatchId) {
    throw new Error('Expected remote post-classifier execution fixture')
  }
  await expect(getClassifierBorrowedDecisionFacts(input.lease.decisionBatchId)).resolves.toEqual({
    batches: 1,
    calls: 0,
    snapshots: remote.questions.length,
    topicResults: 0,
    storyResults: 0,
  })
}
