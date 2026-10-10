import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setPostClassifierToggleForTest } from '@voucha/test-helpers/entities/post-classifier-toggles'
import { POST_CLASSIFIER_SLUG } from '@voucha/types/entities/post-classifier'
import { installEfficiencyProvider } from '@voucha/test-helpers/classifier-call-efficiency-provider'
import { postClassifierEfficiencyDriver } from '@voucha/test-helpers/classifier-call-efficiency-driver-post-classifier'
import {
  deliverRun,
  efficiencyWindow,
  reportedContentVersion,
  reserveSeededRun,
} from '@voucha/test-helpers/classifier-call-efficiency-run'
import { describeClassifierCallEfficiency } from '@voucha/test-helpers/classifier-call-efficiency-tests'
import { DAILY_CAP_MICROUNITS } from '@voucha/test-helpers/classifier-provider-failure-scenarios'
import { getSubjectClassifierRunFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import {
  createApprovedClassifierPost,
  initializePostClassifierExecutionTests,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import { listAiUsageRecordsForClassifierRun } from '@voucha/test-helpers/entities/ai-usage'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import * as vurst from '@jongleberry/vurst-ai'
import { getCurrentPostClassifierActorId } from '@services/post-classifier/configuration-data'
import { getPostClassifierLocalOutcomeFacts } from '@voucha/test-helpers/data-stores/psql/post-classifier/run-facts'
import { readSubjectTopicRelationFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/subject-topic-relations'
import { fetchStructuredDecisionProvider } from '@modules/structured-decisions/transport'

vi.mock<typeof import('@modules/structured-decisions/transport')>(
  import('@modules/structured-decisions/transport'),
  async original => ({
    ...(await original()),
    fetchStructuredDecisionProvider: vi.fn<typeof fetchStructuredDecisionProvider>(),
  }),
)

vi.mock<typeof import('@jongleberry/vurst-ai')>(
  import('@jongleberry/vurst-ai'),
  async original => ({
    ...(await original()),
    detectAiGeneratedText: vi.fn<typeof vurst.detectAiGeneratedText>(async (_text, threshold) => ({
      flagged: false,
      confidenceScore: 0,
      confidenceThreshold: threshold ?? 0.95,
      classification: 'human',
      detector: 'typed-external-detector-fixture',
      detectorModelVersion: 'fixture-negative-v1',
    })),
  }),
)

describeClassifierCallEfficiency(postClassifierEfficiencyDriver)

describe('C5 post classifier local-only call efficiency (real PG, deterministic provider)', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  beforeEach(() => {
    vi.mocked(vurst.detectAiGeneratedText).mockImplementation(async (_text, threshold) => ({
      flagged: false,
      confidenceScore: 0,
      confidenceThreshold: threshold ?? 0.95,
      classification: 'human',
      detector: 'typed-external-detector-fixture',
      detectorModelVersion: 'fixture-negative-v1',
    }))
    vi.stubEnv('OPENROUTER_API_KEY', 'test-provider-key')
  })
  afterEach(() => {
    vi.mocked(vurst.detectAiGeneratedText).mockReset()
    vi.unstubAllEnvs()
    vi.mocked(fetchStructuredDecisionProvider).mockReset()
  })
  afterAll(async () => release?.())

  it('runs the local detector for free and reports no provider call, cost or attempt', async () => {
    const provider = installEfficiencyProvider()
    const window = efficiencyWindow()
    const { post, inputSha256 } = await createApprovedClassifierPost(false, true)
    const seed = { subject: { postId: post.id, rssFeedItemId: null }, inputSha256 } as const
    await withReservedAiUsageDay(DAILY_CAP_MICROUNITS, async () => {
      const run = await reserveSeededRun(POST_CLASSIFIER_SLUG, seed)
      expect(await deliverRun(POST_CLASSIFIER_SLUG, run)).toBe('completed')
      expect(await deliverRun(POST_CLASSIFIER_SLUG, run)).toBe('replay')

      expect(provider.requests).toEqual([])
      expect(await listAiUsageRecordsForClassifierRun(run.runId)).toEqual([])
      expect(await getSubjectClassifierRunFacts(seed.subject, POST_CLASSIFIER_SLUG)).toMatchObject([
        { provider_attempts_started: 0, completed_at: expect.any(Date) },
      ])
      const { version } = await reportedContentVersion(window, POST_CLASSIFIER_SLUG, seed)
      expect(version).toMatchObject({
        runs: 1,
        billedRuns: 0,
        reclassifications: 0,
        providerCalls: 0,
        attemptsStarted: 0,
        maxProviderCallsPerRun: 0,
        runsOverOneCall: 0,
        costMicrounits: '0',
        localDetectorRuns: 1,
      })
    })
  })

  it('applies a flagged local outcome and classifier vote once without provider billing', async () => {
    vi.mocked(vurst.detectAiGeneratedText).mockImplementation(async (_text, threshold) => ({
      flagged: true,
      confidenceScore: 1,
      confidenceThreshold: threshold ?? 0.95,
      classification: 'ai',
      detector: 'typed-external-detector-fixture',
      detectorModelVersion: 'fixture-positive-v1',
    }))
    const provider = installEfficiencyProvider()
    const { post, inputSha256 } = await createApprovedClassifierPost(false, true)
    const seed = { subject: { postId: post.id, rssFeedItemId: null }, inputSha256 } as const
    await withReservedAiUsageDay(DAILY_CAP_MICROUNITS, async () => {
      const run = await reserveSeededRun(POST_CLASSIFIER_SLUG, seed)
      expect(await deliverRun(POST_CLASSIFIER_SLUG, run)).toBe('completed')
      const outcome = await getPostClassifierLocalOutcomeFacts(run.runId)
      expect(outcome).toMatchObject({
        run_id: run.runId,
        is_flagged: true,
        classification: 'ai',
        confidence_score: 1,
        detector: 'typed-external-detector-fixture',
        detector_model_version: 'fixture-positive-v1',
      })
      if (!outcome) throw new Error('Expected the persisted local outcome')
      const actorId = await getCurrentPostClassifierActorId()
      const relations = await readSubjectTopicRelationFacts(seed.subject)
      expect(relations).toEqual([
        {
          id: expect.any(String),
          topicId: outcome.local_topic_id,
          createdById: actorId,
          deletedAt: null,
          netScore: expect.any(Number),
          votes: [{ userId: actorId, score: 1 }],
        },
      ])
      expect(await deliverRun(POST_CLASSIFIER_SLUG, run)).toBe('replay')
      expect(await getPostClassifierLocalOutcomeFacts(run.runId)).toEqual(outcome)
      expect(await readSubjectTopicRelationFacts(seed.subject)).toEqual(relations)
      expect(vurst.detectAiGeneratedText).toHaveBeenCalledTimes(1)
      expect(provider.requests).toEqual([])
      expect(await listAiUsageRecordsForClassifierRun(run.runId)).toEqual([])
      expect(await getSubjectClassifierRunFacts(seed.subject, POST_CLASSIFIER_SLUG)).toMatchObject([
        { id: run.runId, provider_attempts_started: 0, completed_at: expect.any(Date) },
      ])
    })
  })

  it('bills a changed enabled-question configuration once while preserving content identity', async () => {
    const provider = installEfficiencyProvider()
    const window = efficiencyWindow()
    const { community, post, inputSha256 } = await createApprovedClassifierPost(
      ['self-promotion'],
      true,
    )
    const seed = { subject: { postId: post.id, rssFeedItemId: null }, inputSha256 } as const
    await withReservedAiUsageDay(DAILY_CAP_MICROUNITS, async () => {
      const first = await reserveSeededRun(POST_CLASSIFIER_SLUG, seed)
      expect(await deliverRun(POST_CLASSIFIER_SLUG, first)).toBe('completed')
      await setPostClassifierToggleForTest(community.id, 'politics-averse', true)
      const second = await reserveSeededRun(POST_CLASSIFIER_SLUG, seed)
      expect(second.runId).not.toBe(first.runId)
      expect(second.configurationSha256.equals(first.configurationSha256)).toBe(false)
      expect(second.inputSha256.equals(first.inputSha256)).toBe(true)
      expect(await deliverRun(POST_CLASSIFIER_SLUG, second)).toBe('completed')
      expect(await deliverRun(POST_CLASSIFIER_SLUG, second)).toBe('replay')
      expect(provider.requests).toHaveLength(2)
      expect(provider.requests[0]).toHaveLength(1)
      expect(provider.requests[1]).toHaveLength(2)
      expect(await listAiUsageRecordsForClassifierRun(first.runId)).toHaveLength(1)
      expect(await listAiUsageRecordsForClassifierRun(second.runId)).toHaveLength(1)
      expect(await getSubjectClassifierRunFacts(seed.subject, POST_CLASSIFIER_SLUG)).toHaveLength(2)
      const { version, runs } = await reportedContentVersion(window, POST_CLASSIFIER_SLUG, seed)
      expect(runs).toHaveLength(2)
      expect(version).toMatchObject({
        runs: 2,
        billedRuns: 2,
        reclassifications: 1,
        providerCalls: 2,
        attemptsStarted: 2,
        maxProviderCallsPerRun: 1,
        runsOverOneCall: 0,
        costMicrounits: '4000',
      })
    })
  })
})
