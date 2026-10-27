import {
  createAutotaggerPostFixture,
  requestAutotaggerRun,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import {
  AUTOTAGGER_AGENT_SLUG,
  completeTaggingRunForTest,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-fixture'
import { retireClassifierRunPayloadForTest } from '@voucha/test-helpers/classifier-cache-retention'
import {
  sweepableAutotaggerPostIds,
  sweepablePostIds,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/request-retirement'
import { getClassifierRunRequestFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import {
  createApprovedClassifierPost,
  createTestPostClassifierAdapter,
  initializePostClassifierExecutionTests,
  requestPostClassifierRun,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import { setPostClassifierPostHashForTest } from '@voucha/test-helpers/data-stores/psql/post-classifier/run-facts'
import { POST_CLASSIFIER_SLUG } from '@voucha/types/entities/post-classifier'
import { TAGGING_CLASSIFIER_SLUG } from '@voucha/types/entities/tagging-classifier'
import { createAutotaggerAgentRunAdapter } from '../../autotagger/agent/adapter.mts'
import {
  listPendingClassifierRunRequests,
  reserveClassifierRun,
} from '../../classifier-runs/index.mts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { restorePostClearanceStatus, setPostClearanceStatus } from '../set-status.mts'

type Fixture = { post: { id: string }; inputSha256: Buffer }

const classifiers = [
  {
    slug: POST_CLASSIFIER_SLUG,
    create: (): Promise<Fixture> => createApprovedClassifierPost(),
    request: (fixture: Fixture) => requestPostClassifierRun(fixture.post, fixture.inputSha256),
    sweptPostIds: () => sweepablePostIds(createTestPostClassifierAdapter()),
  },
  {
    slug: TAGGING_CLASSIFIER_SLUG,
    create: (): Promise<Fixture> => createAutotaggerPostFixture(),
    request: (fixture: Fixture) =>
      requestAutotaggerRun({
        subject: { postId: fixture.post.id, rssFeedItemId: null },
        inputSha256: fixture.inputSha256,
      }),
    sweptPostIds: sweepableAutotaggerPostIds,
  },
]

const isRetired = async (postId: string, slug: string) =>
  (await getClassifierRunRequestFacts(postId, slug)).map(request => request.stale_at !== null)

describe('approving a post returns the requests the sweep retired (real PG)', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  afterAll(async () => release?.())

  describe.each(classifiers)('$slug', ({ slug, create, request, sweptPostIds }) => {
    it('sweeps the request again when setPostClearanceStatus approves the post', async () => {
      const fixture = await create()
      await request(fixture)
      await setPostClearanceStatus(fixture.post.id, 'in_review')
      expect(await sweptPostIds()).not.toContain(fixture.post.id)
      expect(await isRetired(fixture.post.id, slug)).toEqual([true])

      await setPostClearanceStatus(fixture.post.id, 'approved')

      expect(await isRetired(fixture.post.id, slug)).toEqual([false])
      expect(await sweptPostIds()).toContain(fixture.post.id)
    })

    it('sweeps the request again when a compensation restores approval', async () => {
      const fixture = await create()
      await request(fixture)
      await setPostClearanceStatus(fixture.post.id, 'rejected')
      expect(await sweptPostIds()).not.toContain(fixture.post.id)

      await restorePostClearanceStatus(
        fixture.post.id,
        'approved',
        null,
        {},
        { reason: 'rollback', compensates_change_id: 'change', restores_change_id: null },
      )

      expect(await sweptPostIds()).toContain(fixture.post.id)
    })

    it.each(['in_review', 'rejected', 'pending'] as const)(
      'leaves the request retired when the post moves to %s',
      async status => {
        const fixture = await create()
        await request(fixture)
        await setPostClearanceStatus(fixture.post.id, 'in_review')
        expect(await sweptPostIds()).not.toContain(fixture.post.id)

        await setPostClearanceStatus(fixture.post.id, status)

        expect(await isRetired(fixture.post.id, slug)).toEqual([true])
      },
    )

    it('leaves a request for older content retired when the post is approved at newer content', async () => {
      const fixture = await create()
      await request(fixture)
      await setPostClearanceStatus(fixture.post.id, 'in_review')
      expect(await sweptPostIds()).not.toContain(fixture.post.id)
      await setPostClassifierPostHashForTest(fixture.post.id, Buffer.alloc(32, 7))

      await setPostClearanceStatus(fixture.post.id, 'approved')

      expect(await isRetired(fixture.post.id, slug)).toEqual([true])
    })
  })

  it('writes no request for a post that was never requested, as when a post is approved at creation', async () => {
    const { post } = await createApprovedClassifierPost()

    await setPostClearanceStatus(post.id, 'approved')

    for (const { slug } of classifiers)
      expect(await getClassifierRunRequestFacts(post.id, slug)).toEqual([])
  })

  it('does not re-arm an unchanged follow-on after its first-stage payload retires', async () => {
    const fixture = await createAutotaggerPostFixture()
    const { lease } = await completeTaggingRunForTest(fixture)
    const agentAdapter = createAutotaggerAgentRunAdapter()
    const before = await getClassifierRunRequestFacts(fixture.post.id, AUTOTAGGER_AGENT_SLUG)
    expect(before).toHaveLength(1)

    await setPostClearanceStatus(fixture.post.id, 'rejected')
    expect((await listPendingClassifierRunRequests(agentAdapter, null)).items).not.toContainEqual(
      expect.objectContaining({ postId: fixture.post.id }),
    )
    expect(
      (await getClassifierRunRequestFacts(fixture.post.id, AUTOTAGGER_AGENT_SLUG))[0]!.stale_at,
    ).not.toBeNull()

    expect(await retireClassifierRunPayloadForTest(lease.runId)).toBe(1)
    await setPostClearanceStatus(fixture.post.id, 'approved')

    const after = await getClassifierRunRequestFacts(fixture.post.id, AUTOTAGGER_AGENT_SLUG)
    expect(after).toEqual(before.map(request => ({ ...request, stale_at: expect.any(Date) })))
    expect((await listPendingClassifierRunRequests(agentAdapter, null)).items).not.toContainEqual(
      expect.objectContaining({ postId: fixture.post.id }),
    )
    expect(await reserveClassifierRun(agentAdapter, fixture.subject)).toEqual({ kind: 'not-ready' })
    expect(
      (await getClassifierRunRequestFacts(fixture.post.id, TAGGING_CLASSIFIER_SLUG))[0]!
        .run_settled_at,
    ).not.toBeNull()
  })
})
