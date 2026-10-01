import { getClassifierRunFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import {
  createApprovedClassifierPost,
  createPostClassifierExecutionFixture,
  createTestPostClassifierAdapter,
  initializePostClassifierExecutionTests,
  POST_CLASSIFIER_TEST_DETECTOR_VERSION,
  requestPostClassifierRun,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import { localOutcomeFor } from '@voucha/test-helpers/data-stores/psql/post-classifier/outcomes'
import { setPostClassifierPostHashForTest } from '@voucha/test-helpers/data-stores/psql/post-classifier/run-facts'
import { setPostClassifierToggleForTest } from '@voucha/test-helpers/entities/post-classifier-toggles'
import { setTestPostClearanceStatus } from '@voucha/test-helpers/entities/post-clearance'
import { POST_CLASSIFIER_SLUG } from '@voucha/types/entities/post-classifier'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  claimClassifierRun,
  listPendingClassifierRunRequests,
  persistClassifierRunOutcomes,
  reserveClassifierRun,
} from '@services/classifier-runs'
import { createPostClassifierRunAdapter } from './index.mts'

const runs = (postId: string) => getClassifierRunFacts(postId, POST_CLASSIFIER_SLUG)

const request = requestPostClassifierRun

const pendingPostIds = async () =>
  (await listPendingClassifierRunRequests(createTestPostClassifierAdapter(), null, 500)).items.map(
    item => item.postId,
  )

describe('post classifier run adapter (real PG)', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  afterAll(async () => release?.())

  it('reserves an approved post against its current hash and resolved configuration', async () => {
    const { post, inputSha256 } = await createApprovedClassifierPost(true, true)
    await request(post, inputSha256)

    const result = await reserveClassifierRun(createTestPostClassifierAdapter(), {
      postId: post.id,
      rssFeedItemId: null,
    })

    if (result.kind !== 'reserved') throw new Error(`Unexpected reservation: ${result.kind}`)
    expect(result.run.inputSha256.equals(inputSha256)).toBe(true)
    expect(result.run.decisionBatchId).not.toBeNull()
    expect(await runs(post.id)).toMatchObject([
      {
        configuration_sha256: result.run.configurationSha256,
        decision_batch_id: result.run.decisionBatchId,
        provider_attempts_started: 0,
      },
    ])
    expect(await pendingPostIds()).not.toContain(post.id)
  })

  it('never reserves a receipt for an unapproved post', async () => {
    const { post, inputSha256 } = await createApprovedClassifierPost()
    await request(post, inputSha256)
    await setTestPostClearanceStatus(post.id, 'pending')

    const result = await reserveClassifierRun(createTestPostClassifierAdapter(), {
      postId: post.id,
      rssFeedItemId: null,
    })

    expect(result.kind).toBe('stale')
    expect(await runs(post.id)).toEqual([])
  })

  it('keeps a request with an unapproved or revised post out of the sweep until it is current', async () => {
    const eligible = await createApprovedClassifierPost()
    const unapproved = await createApprovedClassifierPost()
    const revised = await createApprovedClassifierPost()
    for (const { post, inputSha256 } of [eligible, unapproved, revised]) {
      await request(post, inputSha256)
    }
    await setTestPostClearanceStatus(unapproved.post.id, 'in_review')
    await setPostClassifierPostHashForTest(revised.post.id, Buffer.alloc(32, 4))

    const pending = await pendingPostIds()

    expect(pending).toContain(eligible.post.id)
    expect(pending).not.toContain(unapproved.post.id)
    expect(pending).not.toContain(revised.post.id)
    await setTestPostClearanceStatus(unapproved.post.id, 'approved')
    expect(await pendingPostIds()).toContain(unapproved.post.id)
  })

  it('refuses a claim for changed content or a different detector version', async () => {
    const setup = await createPostClassifierExecutionFixture(false, true)
    const target = {
      runId: setup.run.runId,
      subject: setup.run.subject,
      inputSha256: setup.run.inputSha256,
      configurationSha256: setup.run.configurationSha256,
      leaseSeconds: 60,
    }
    const newerDetector = createPostClassifierRunAdapter(
      `${POST_CLASSIFIER_TEST_DETECTOR_VERSION}-next`,
    )

    expect(await claimClassifierRun(newerDetector, target)).toEqual({ kind: 'stale' })
    await setPostClassifierPostHashForTest(setup.post.id, Buffer.alloc(32, 7))
    expect(await claimClassifierRun(setup.adapter, target)).toEqual({ kind: 'stale' })
    expect(await runs(setup.post.id)).toHaveLength(1)
  })

  it('treats a moderator toggle written after the claim as a stale mutation boundary', async () => {
    const setup = await createPostClassifierExecutionFixture(true, true)

    await setPostClassifierToggleForTest(setup.community.id, 'ai-generated', false)

    expect(
      await persistClassifierRunOutcomes(setup.adapter, {
        lease: setup.lease,
        local: localOutcomeFor(setup, true),
      }),
    ).toBe('stale')
    expect((await runs(setup.post.id))[0]).toMatchObject({ outcomes_persisted_at: null })
  })
})
