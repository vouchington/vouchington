import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getModerationSystemUserId } from '@services/users/system-users'
import {
  getCommunityPostReviewStatus,
  updateTestCommunityPostReviewState,
} from '@voucha/test-helpers'
import { communityModerationEfficiencyDriver } from '@voucha/test-helpers/classifier-call-efficiency-driver-community-moderation'
import { installEfficiencyProvider } from '@voucha/test-helpers/classifier-call-efficiency-provider'
import {
  deliverRun,
  efficiencyWindow,
  ONE_BILLED_CALL,
  reportedContentVersion,
  reserveSeededRun,
  reserveSeededRunOutcome,
} from '@voucha/test-helpers/classifier-call-efficiency-run'
import { describeClassifierCallEfficiency } from '@voucha/test-helpers/classifier-call-efficiency-tests'
import {
  COMMUNITY_MODERATION_CLASSIFIER_SLUG as SLUG,
  createCommunityModerationFixture,
  editTestCommunityRule,
  reviseCommunityModerationFixturePost,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/community-moderation-fixture'
import { listAiUsageRecordsForClassifierRun } from '@voucha/test-helpers/entities/ai-usage'
import { withCurrentClassifierUsage } from '@voucha/test-helpers/classifier-current-usage'
import { fetchStructuredDecisionProvider } from '@modules/structured-decisions/transport'

vi.mock<typeof import('@modules/structured-decisions/transport')>(
  import('@modules/structured-decisions/transport'),
  async original => ({
    ...(await original()),
    fetchStructuredDecisionProvider: vi.fn<typeof fetchStructuredDecisionProvider>(),
  }),
)

describeClassifierCallEfficiency(communityModerationEfficiencyDriver)

describe('C8 community moderation content and rule versions (real PG, deterministic provider)', () => {
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-provider-key')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.mocked(fetchStructuredDecisionProvider).mockReset()
  })

  it('does not bill a rule edit again at the same content identity', async () => {
    const provider = installEfficiencyProvider()
    const window = efficiencyWindow()
    const fixture = await createCommunityModerationFixture()
    await withCurrentClassifierUsage(async trackRunId => {
      const first = await reserveSeededRun(SLUG, fixture)
      trackRunId(first.runId)
      expect(await deliverRun(SLUG, first)).toBe('completed')
      await editTestCommunityRule(fixture.prompts[0]!.id, 'No spam of any kind, ever')
      const second = await reserveSeededRunOutcome(SLUG, fixture)

      expect(second).toEqual({ kind: 'no-work' })
      expect(provider.requests).toHaveLength(1)
      expect(await listAiUsageRecordsForClassifierRun(first.runId)).toHaveLength(1)
      const { version, runs } = await reportedContentVersion(window, SLUG, fixture)
      expect(runs).toHaveLength(1)
      expect(version).toMatchObject({
        runs: 1,
        billedRuns: 1,
        reclassifications: 0,
        providerCalls: 1,
        maxProviderCallsPerRun: 1,
        runsOverOneCall: 0,
        costMicrounits: '2000',
      })
    })
  })

  it('bills an edited post as a new content version, leaving the first one at one call', async () => {
    const provider = installEfficiencyProvider()
    const window = efficiencyWindow()
    const fixture = await createCommunityModerationFixture()
    await withCurrentClassifierUsage(async trackRunId => {
      const first = await reserveSeededRun(SLUG, fixture)
      trackRunId(first.runId)
      expect(await deliverRun(SLUG, first)).toBe('completed')
      const inputSha256 = await reviseCommunityModerationFixturePost(fixture, 'A revised post')
      const revised = { subject: fixture.subject, inputSha256 }
      const second = await reserveSeededRun(SLUG, revised)
      trackRunId(second.runId)
      expect(await deliverRun(SLUG, second)).toBe('completed')

      expect(second.runId).not.toBe(first.runId)
      expect(inputSha256.equals(fixture.inputSha256)).toBe(false)
      expect(provider.requests).toHaveLength(2)
      expect((await reportedContentVersion(window, SLUG, fixture)).version).toMatchObject(
        ONE_BILLED_CALL,
      )
      expect((await reportedContentVersion(window, SLUG, revised)).version).toMatchObject(
        ONE_BILLED_CALL,
      )
    })
  })

  it('unpublishes once: a redelivery, a re-trigger or a restored post is never billed or unpublished again', async () => {
    const provider = installEfficiencyProvider()
    const window = efficiencyWindow()
    const fixture = await createCommunityModerationFixture({ automodAction: 'unpublish' })
    const reviewOf = () => getCommunityPostReviewStatus(fixture.community.id, fixture.postId)
    await withCurrentClassifierUsage(async trackRunId => {
      const run = await reserveSeededRun(SLUG, fixture)
      trackRunId(run.runId)
      expect(await deliverRun(SLUG, run)).toBe('completed')
      const unpublished = await reviewOf()
      expect(unpublished).toMatchObject({
        unpublished_at: expect.any(Date),
        unpublished_by_id: await getModerationSystemUserId(),
      })

      // The unpublish withdrew the post's approval, so the redelivery is stale: it does nothing.
      expect(await deliverRun(SLUG, run)).toBe('stale')
      expect(await reviewOf()).toEqual(unpublished)
      await updateTestCommunityPostReviewState({
        communityId: fixture.community.id,
        postId: fixture.postId,
        approvedAt: new Date(),
        unpublishedAt: null,
      })
      const again = await reserveSeededRun(SLUG, fixture)
      expect(again.runId).toBe(run.runId)
      expect(await deliverRun(SLUG, again)).toBe('replay')

      expect(await reviewOf()).toMatchObject({ unpublished_at: null })
      expect(provider.requests).toHaveLength(1)
      expect(await listAiUsageRecordsForClassifierRun(run.runId)).toHaveLength(1)
      expect((await reportedContentVersion(window, SLUG, fixture)).version).toMatchObject(
        ONE_BILLED_CALL,
      )
    })
  })
})
