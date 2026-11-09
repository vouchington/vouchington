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
import { fetchStructuredDecisionProvider } from '@modules/structured-decisions/transport'
import { spendCapConfig } from '@services/ai-usage'
import { communityAgentPromptsConfig } from '@services/community-agent-prompts/config'
import { getActiveCommunityAgentPromptPage } from '@services/community-agent-prompts/get-active-prompts'
import { requestCommunityModerationRunForPost } from '@services/communities/publications/moderation-run'
import {
  getCommunityPostReviewStatus,
  updateTestCommunityPostReviewState,
} from '@voucha/test-helpers'
import { deliverRun } from '@voucha/test-helpers/classifier-call-efficiency-run'
import {
  COMMUNITY_MODERATION_CLASSIFIER_SLUG as SLUG,
  createCommunityModerationFixture,
  editTestCommunityRule,
  requestCommunityModerationFixtureRun,
  reserveCommunityModerationFixtureRun,
  reviseCommunityModerationFixturePost,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/community-moderation-fixture'
import { answerCommunityQuestions } from '@voucha/test-helpers/data-stores/psql/classifier-runs/community-moderation-provider'
import { getClassifierRunFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getClassifierRunHandler } from './classifier-run-registry.mts'

vi.mock<typeof import('@modules/structured-decisions/transport')>(
  import('@modules/structured-decisions/transport'),
  async original => ({
    ...(await original()),
    fetchStructuredDecisionProvider: vi.fn<typeof fetchStructuredDecisionProvider>(),
  }),
)

const provider = vi.mocked(fetchStructuredDecisionProvider)
const handler = getClassifierRunHandler(SLUG)
let restoreSpendCap: (() => void) | undefined

describe('C8 replayed final page action (real PG, mocked provider)', () => {
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
