import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchStructuredDecisionProvider } from '@modules/structured-decisions/transport'
import { spendCapConfig } from '@services/ai-usage'
import { getModerationSystemUserId } from '@services/users/system-users'
import {
  getCommunityPostReviewAutomodState,
  getCommunityPostReviewStatus,
  updateTestCommunityPostReviewState,
} from '@voucha/test-helpers'
import { classifierRunJobFor } from '@voucha/test-helpers/classifier-run-worker'
import {
  COMMUNITY_MODERATION_CLASSIFIER_SLUG,
  createCommunityModerationFixture,
  readCommunityModerationProjection,
  reserveCommunityModerationFixtureRun,
  setTestCommunityAutomodAction,
  setTestCommunityPostReviewPlatformOverride,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/community-moderation-fixture'
import { answerCommunityQuestions } from '@voucha/test-helpers/data-stores/psql/classifier-runs/community-moderation-provider'
import { getClassifierRunFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { toClassifierRunJobData } from './classifier-run-handler.mts'
import { processClassifierRun } from './process-classifier-run.mts'

vi.mock<typeof import('@modules/structured-decisions/transport')>(
  import('@modules/structured-decisions/transport'),
  async original => ({
    ...(await original()),
    fetchStructuredDecisionProvider: vi.fn<typeof fetchStructuredDecisionProvider>(),
  }),
)

const provider = vi.mocked(fetchStructuredDecisionProvider)
type AnswerOptions = NonNullable<Parameters<typeof answerCommunityQuestions>[1]>

const processRun = (run: Parameters<typeof toClassifierRunJobData>[1]) =>
  processClassifierRun(
    classifierRunJobFor(toClassifierRunJobData(COMMUNITY_MODERATION_CLASSIFIER_SLUG, run)),
  )

/** A published post whose first prompt is flagged under the given community action. */
async function flaggedFixture(action: 'record_only' | 'review_queue' | 'unpublish') {
  const fixture = await createCommunityModerationFixture({ automodAction: action })
  const flaggedId = fixture.prompts[0]!.id
  return { fixture, flaggedId }
}

function answerWith(options: AnswerOptions) {
  provider.mockImplementation(async (_url, init) => answerCommunityQuestions(init, options))
}

const stateOf = async (fixture: { postId: string; community: { id: string } }) => ({
  review: await getCommunityPostReviewStatus(fixture.community.id, fixture.postId),
  flag: await getCommunityPostReviewAutomodState(fixture.postId),
})

describe('C8 community actions applied in the completion transaction (real PG, mocked provider)', () => {
  let restoreSpendCap: (() => void) | undefined
  beforeAll(async () => {
    await spendCapConfig.waitForInitialization()
    restoreSpendCap = overrideDynamicConfigFieldsForTest(spendCapConfig, { enabled: false })
  })
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-provider-key')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    provider.mockReset()
  })
  afterAll(() => restoreSpendCap?.())

  it('records the flag and does nothing else under record_only', async () => {
    const { fixture, flaggedId } = await flaggedFixture('record_only')
    answerWith({ flagged: new Set([flaggedId]) })

    await processRun(await reserveCommunityModerationFixtureRun(fixture))

    const projection = await readCommunityModerationProjection(fixture.postId)
    expect(projection.filter(row => row.is_flagged).map(row => row.prompt_id)).toEqual([flaggedId])
    const { review, flag } = await stateOf(fixture)
    expect(review).toMatchObject({ unpublished_at: null })
    expect(flag).toMatchObject({ automod_action: null })
  })

  it('flags the review for the run digest under review_queue and keeps the post published', async () => {
    const { fixture, flaggedId } = await flaggedFixture('review_queue')
    answerWith({ flagged: new Set([flaggedId]) })

    await processRun(await reserveCommunityModerationFixtureRun(fixture))

    const { review, flag } = await stateOf(fixture)
    expect(review).toMatchObject({ approved_at: expect.any(Date), unpublished_at: null })
    expect(flag?.automod_action).toBe('review_queue')
    expect(flag?.automod_flagged_content_sha256?.equals(fixture.inputSha256)).toBe(true)
  })

  it('unpublishes as the moderation system user under unpublish and records the flag', async () => {
    const { fixture, flaggedId } = await flaggedFixture('unpublish')
    answerWith({ flagged: new Set([flaggedId]) })

    await processRun(await reserveCommunityModerationFixtureRun(fixture))

    const { review, flag } = await stateOf(fixture)
    expect(review).toMatchObject({
      unpublished_at: expect.any(Date),
      unpublished_by_id: await getModerationSystemUserId(),
    })
    expect(flag?.automod_action).toBe('unpublish')
  })

  it.each(['review_queue', 'unpublish'] as const)(
    'takes no %s action when no prompt flags the post',
    async action => {
      const fixture = await createCommunityModerationFixture({ automodAction: action })
      answerWith({})

      await processRun(await reserveCommunityModerationFixtureRun(fixture))

      const { review, flag } = await stateOf(fixture)
      expect(review).toMatchObject({ unpublished_at: null })
      expect(flag).toMatchObject({ automod_action: null })
      expect(await readCommunityModerationProjection(fixture.postId)).toHaveLength(2)
    },
  )

  it.each([
    ['partial', (_flaggedId: string, others: string[]) => ({ omit: new Set(others) })],
    ['mismatched', (flaggedId: string) => ({ extraIds: [`${flaggedId.slice(0, -1)}0`] })],
  ])('takes no action and projects nothing on a %s decision', async (_label, options) => {
    const { fixture, flaggedId } = await flaggedFixture('unpublish')
    const others = fixture.prompts.slice(1).map(prompt => prompt.id)
    answerWith({ flagged: new Set([flaggedId]), ...options(flaggedId, others) })

    const outcome = await processRun(await reserveCommunityModerationFixtureRun(fixture)).then(
      result => result.kind,
      () => 'threw',
    )

    expect(outcome).not.toBe('completed')
    expect((await getClassifierRunFacts(fixture.postId))[0]?.completed_at).toBeNull()
    expect(await readCommunityModerationProjection(fixture.postId)).toEqual([])
    const { review, flag } = await stateOf(fixture)
    expect(review).toMatchObject({ unpublished_at: null })
    expect(flag).toMatchObject({ automod_action: null })
  })

  it('leaves a post under platform override published while still recording the projection', async () => {
    const { fixture, flaggedId } = await flaggedFixture('unpublish')
    await setTestCommunityPostReviewPlatformOverride(fixture.postId, fixture.creator.id)
    answerWith({ flagged: new Set([flaggedId]) })

    await processRun(await reserveCommunityModerationFixtureRun(fixture))

    const { review, flag } = await stateOf(fixture)
    expect(review).toMatchObject({ unpublished_at: null })
    expect(flag).toMatchObject({ automod_action: null })
    expect(
      (await readCommunityModerationProjection(fixture.postId)).filter(row => row.is_flagged),
    ).toHaveLength(1)
  })

  it('does not bill again or act when the community action changes after the run completed', async () => {
    const { fixture, flaggedId } = await flaggedFixture('record_only')
    answerWith({ flagged: new Set([flaggedId]) })
    const run = await reserveCommunityModerationFixtureRun(fixture)
    await processRun(run)

    await setTestCommunityAutomodAction(fixture.community.id, 'unpublish')
    const again = await reserveCommunityModerationFixtureRun(fixture)
    await expect(processRun(again)).resolves.toEqual({ kind: 'replay' })

    expect(again.runId).toBe(run.runId)
    expect(provider).toHaveBeenCalledOnce()
    expect((await stateOf(fixture)).review).toMatchObject({ unpublished_at: null })
  })

  it('never re-applies a completed run to a post a moderator restored', async () => {
    const { fixture, flaggedId } = await flaggedFixture('unpublish')
    answerWith({ flagged: new Set([flaggedId]) })
    const run = await reserveCommunityModerationFixtureRun(fixture)
    await processRun(run)
    await updateTestCommunityPostReviewState({
      communityId: fixture.community.id,
      postId: fixture.postId,
      approvedAt: new Date(),
      unpublishedAt: null,
    })

    await expect(processRun(run)).resolves.toEqual({ kind: 'replay' })
    const again = await reserveCommunityModerationFixtureRun(fixture)
    await expect(processRun(again)).resolves.toEqual({ kind: 'replay' })

    expect(again.runId).toBe(run.runId)
    expect(provider).toHaveBeenCalledOnce()
    expect((await stateOf(fixture)).review).toMatchObject({ unpublished_at: null })
  })
})
