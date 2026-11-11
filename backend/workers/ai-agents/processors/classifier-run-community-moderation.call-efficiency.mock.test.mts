import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest'
import { spendCapConfig } from '@services/ai-usage'
import { communityAgentPromptsConfig } from '@services/community-agent-prompts/config'
import { getActiveCommunityAgentPromptPage } from '@services/community-agent-prompts/get-active-prompts'
import { requestCommunityModerationRunForPost } from '@services/communities/publications/moderation-run'
import { getModerationSystemUserId } from '@services/users/system-users'
import {
  getCommunityPostReviewStatus,
  updateTestCommunityPostReviewState,
} from '@voucha/test-helpers'
import { communityModerationEfficiencyDriver } from '@voucha/test-helpers/classifier-call-efficiency-driver-community-moderation'
import { installEfficiencyProvider } from '@voucha/test-helpers/classifier-call-efficiency-provider'
import { answerCommunityQuestions } from '@voucha/test-helpers/data-stores/psql/classifier-runs/community-moderation-provider'
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
  requestCommunityModerationFixtureRun,
  reserveCommunityModerationFixtureRun,
  reviseCommunityModerationFixturePost,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/community-moderation-fixture'
import { getClassifierRunFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { listAiUsageRecordsForClassifierRun } from '@voucha/test-helpers/entities/ai-usage'
import { withCurrentClassifierUsage } from '@voucha/test-helpers/classifier-current-usage'
import { fetchStructuredDecisionProvider } from '@modules/structured-decisions/transport'
import { getClassifierRunHandler } from './classifier-run-registry.mts'

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
    vi.stubEnv('OPENAI_API_KEY', 'test-provider-key')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.mocked(fetchStructuredDecisionProvider).mockReset()
  })

  it('bills an edited rule once under a new configuration identity', async () => {
    const provider = installEfficiencyProvider()
    const window = efficiencyWindow()
    const fixture = await createCommunityModerationFixture()
    await withCurrentClassifierUsage(async trackRunId => {
      const first = await reserveSeededRun(SLUG, fixture)
      trackRunId(first.runId)
      expect(await deliverRun(SLUG, first)).toBe('completed')
      await editTestCommunityRule(fixture.prompts[0]!.id, 'No spam of any kind, ever')
      const second = await reserveSeededRun(SLUG, fixture)
      trackRunId(second.runId)
      expect(second.runId).not.toBe(first.runId)
      expect(await deliverRun(SLUG, second)).toBe('completed')

      expect(provider.requests).toHaveLength(2)
      expect(await listAiUsageRecordsForClassifierRun(first.runId)).toHaveLength(1)
      expect(await listAiUsageRecordsForClassifierRun(second.runId)).toHaveLength(1)
      const { version, runs } = await reportedContentVersion(window, SLUG, fixture)
      expect(runs).toHaveLength(2)
      expect(version).toMatchObject({
        runs: 2,
        billedRuns: 2,
        reclassifications: 1,
        providerCalls: 2,
        maxProviderCallsPerRun: 1,
        runsOverOneCall: 0,
        costMicrounits: '4000',
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

      // The receipt already completed, so redelivery replays without running its action again.
      expect(await deliverRun(SLUG, run)).toBe('replay')
      expect(await reviewOf()).toEqual(unpublished)
      await updateTestCommunityPostReviewState({
        communityId: fixture.community.id,
        postId: fixture.postId,
        approvedAt: new Date(),
        unpublishedAt: null,
      })
      expect(await reserveSeededRunOutcome(SLUG, fixture)).toEqual({ kind: 'no-work' })

      expect(await reviewOf()).toMatchObject({ unpublished_at: null })
      expect(provider.requests).toHaveLength(1)
      expect(await listAiUsageRecordsForClassifierRun(run.runId)).toHaveLength(1)
      expect((await reportedContentVersion(window, SLUG, fixture)).version).toMatchObject(
        ONE_BILLED_CALL,
      )
    })
  })
})

describe('C8 replayed final page action (real PG, mocked provider)', () => {
  const provider = vi.mocked(fetchStructuredDecisionProvider)
  const handler = getClassifierRunHandler(SLUG)
  let restoreSpendCap: (() => void) | undefined

  beforeAll(async () => {
    await spendCapConfig.waitForInitialization()
    restoreSpendCap = overrideDynamicConfigFieldsForTest(spendCapConfig, { enabled: false })
  })
  beforeEach(() => vi.stubEnv('OPENAI_API_KEY', 'test-provider-key'))
  afterEach(() => {
    vi.unstubAllEnvs()
    provider.mockReset()
  })
  afterAll(() => restoreSpendCap?.())

  it('applies a new earlier-page flag when the final page replays, then leaves a restored post alone', async () => {
    await communityAgentPromptsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(communityAgentPromptsConfig, { moderation_page_size: 1 }),
    )
    const fixture = await createCommunityModerationFixture({ automodAction: 'unpublish' })
    const review = () => getCommunityPostReviewStatus(fixture.community.id, fixture.postId)
    const firstPage = await getActiveCommunityAgentPromptPage(fixture.community.id, null, 1)
    const firstRuleId = firstPage.items[0]!.id
    provider.mockImplementation(async (_url, init) => answerCommunityQuestions(init))
    expect(await deliverRun(SLUG, await reserveCommunityModerationFixtureRun(fixture))).toBe(
      'completed',
    )
    const originalFinal = await handler.reserve(fixture.subject)
    if (originalFinal.kind !== 'reserved') throw new Error('original final page was not reserved')
    expect(await deliverRun(SLUG, originalFinal.run)).toBe('completed')
    expect(await review()).toMatchObject({ unpublished_at: null })

    await editTestCommunityRule(firstRuleId, 'Edited rule that now flags the post')
    await requestCommunityModerationFixtureRun(fixture)
    provider.mockImplementation(async (_url, init) =>
      answerCommunityQuestions(init, { flagged: new Set([firstRuleId]) }),
    )
    const changed = await handler.reserve(fixture.subject)
    if (changed.kind !== 'reserved') throw new Error('edited first page was not reserved')
    expect(await requestCommunityModerationRunForPost(fixture.postId)).toBe(true)
    expect(await deliverRun(SLUG, changed.run)).toBe('completed')
    expect(await review()).toMatchObject({ unpublished_at: null })
    expect(await requestCommunityModerationRunForPost(fixture.postId)).toBe(true)
    const revised = await reviseCommunityModerationFixturePost(fixture, 'A temporary revision')
    expect(revised.equals(fixture.inputSha256)).toBe(false)
    expect(await requestCommunityModerationRunForPost(fixture.postId)).toBe(true)
    const reverted = await reviseCommunityModerationFixturePost(
      fixture,
      'A post under the community rules.',
    )
    expect(reverted.equals(fixture.inputSha256)).toBe(true)
    expect(await requestCommunityModerationRunForPost(fixture.postId)).toBe(true)
    await expect(handler.reserve(fixture.subject)).resolves.toEqual({ kind: 'no-work' })
    expect(await review()).toMatchObject({ unpublished_at: expect.any(Date) })
    expect(provider).toHaveBeenCalledTimes(3)
    expect(await getClassifierRunFacts(fixture.postId, SLUG)).toHaveLength(3)

    await updateTestCommunityPostReviewState({
      communityId: fixture.community.id,
      postId: fixture.postId,
      approvedAt: new Date(),
      unpublishedAt: null,
    })
    expect(await deliverRun(SLUG, originalFinal.run)).toBe('replay')
    await requestCommunityModerationFixtureRun(fixture)
    await expect(handler.reserve(fixture.subject)).resolves.toEqual({ kind: 'no-work' })
    await expect(handler.reserve(fixture.subject)).resolves.toEqual({ kind: 'no-work' })
    expect(provider).toHaveBeenCalledTimes(3)
    expect(await review()).toMatchObject({ unpublished_at: null })
  })
})
