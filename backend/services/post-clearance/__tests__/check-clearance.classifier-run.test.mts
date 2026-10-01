import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  setPostModerationComplete,
  setPostSpamDetectionComplete,
  safeUsername,
} from '@voucha/test-helpers'
import { readClassifierRunDispatcherJobsForTest } from '@voucha/test-helpers/classifier-run-queue-jobs'
import { getClassifierRunRequestFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { initializePostClassifierExecutionTests } from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import { getPostClassifierPostHashForTest } from '@voucha/test-helpers/data-stores/psql/post-classifier/run-facts'
import { POST_CLASSIFIER_SLUG } from '@voucha/types/entities/post-classifier'
import { TAGGING_CLASSIFIER_SLUG } from '@voucha/types/entities/tagging-classifier'
import { checkPostClearance, resetPostClearance } from '../index.mts'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('checkPostClearance requests a classifier run on approval', () => {
  let userId: string
  let release: (() => Promise<void>) | undefined

  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
    userId = (await createTestUser({ username: safeUsername('clearance-classifier-run') })).id
  })
  afterAll(async () => release?.())

  async function dispatcherJobsFor(postId: string, classifier: string) {
    return (await readClassifierRunDispatcherJobsForTest(postId)).filter(
      job => (job.data as { classifier: string }).classifier === classifier,
    )
  }

  async function pendingPost(label: string) {
    return insertTestPost({
      title: `${label}-${randomSuffix()}`,
      slug: `${label}-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'pending',
    })
  }

  it.each([POST_CLASSIFIER_SLUG, TAGGING_CLASSIFIER_SLUG])(
    'writes the durable %s request in the approval and queues one dispatcher, however often it re-approves',
    async classifier => {
      const postId = await pendingPost('clearance-request')
      await setPostModerationComplete(postId, false)
      await setPostSpamDetectionComplete(postId, false)

      await checkPostClearance(postId)

      const [request, ...rest] = await getClassifierRunRequestFacts(postId, classifier)
      expect(rest).toEqual([])
      expect(request).toMatchObject({ run_id: null, no_work_at: null, stale_at: null })
      expect(request?.input_sha256.equals(await getPostClassifierPostHashForTest(postId))).toBe(
        true,
      )
      const dispatchers = await dispatcherJobsFor(postId, classifier)
      expect(dispatchers.map(job => job.data)).toEqual([
        { classifier, postId, rssFeedItemId: null },
      ])

      await resetPostClearance(postId, userId)
      await setPostSpamDetectionComplete(postId, false)
      await setPostModerationComplete(postId, false)
      await checkPostClearance(postId)

      expect(await getClassifierRunRequestFacts(postId, classifier)).toHaveLength(1)
      expect(await dispatcherJobsFor(postId, classifier)).toHaveLength(1)
    },
  )

  it('requests C5 and C6 together, each with its own dispatcher', async () => {
    const postId = await pendingPost('clearance-both')
    await setPostModerationComplete(postId, false)
    await setPostSpamDetectionComplete(postId, false)

    await checkPostClearance(postId)

    const requests = await getClassifierRunRequestFacts(postId)
    expect(requests.map(request => request.classifier_slug).toSorted()).toEqual(
      [POST_CLASSIFIER_SLUG, TAGGING_CLASSIFIER_SLUG].toSorted(),
    )
    expect(await readClassifierRunDispatcherJobsForTest(postId)).toHaveLength(2)
  })

  it('approves and keeps both requests when no classifier configuration is involved', async () => {
    // Approval never reads classifier configuration, so a missing or unresolvable one cannot block
    // it: the requests are written regardless and the dispatcher, not approval, decides there is no work.
    const postId = await pendingPost('clearance-unconfigured')
    await setPostModerationComplete(postId, false)
    await setPostSpamDetectionComplete(postId, false)

    await expect(checkPostClearance(postId)).resolves.toBeUndefined()

    expect(await getClassifierRunRequestFacts(postId)).toHaveLength(2)
  })

  it('requests and queues nothing for a post that is not approved', async () => {
    const postId = await pendingPost('clearance-review')
    await setPostModerationComplete(postId, false)
    await setPostSpamDetectionComplete(postId, true)

    await checkPostClearance(postId)

    expect(await getClassifierRunRequestFacts(postId)).toEqual([])
    expect(await readClassifierRunDispatcherJobsForTest(postId)).toEqual([])
  })
})
