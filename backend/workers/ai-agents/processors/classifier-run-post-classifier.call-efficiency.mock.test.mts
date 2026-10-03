import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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
import { fetchStructuredDecisionProvider } from '@modules/structured-decisions/transport'

vi.mock<typeof import('@modules/structured-decisions/transport')>(
  import('@modules/structured-decisions/transport'),
  async original => ({
    ...(await original()),
    fetchStructuredDecisionProvider: vi.fn<typeof fetchStructuredDecisionProvider>(),
  }),
)

describeClassifierCallEfficiency(postClassifierEfficiencyDriver)

describe('C5 post classifier local-only call efficiency (real PG, deterministic provider)', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-provider-key')
  })
  afterEach(() => {
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
})
