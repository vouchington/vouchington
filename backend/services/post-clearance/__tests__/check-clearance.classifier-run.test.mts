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

  async function pendingPost(label: string) {
    return insertTestPost({
      title: `${label}-${randomSuffix()}`,
      slug: `${label}-${randomSuffix()}`,
      createdById: userId,
      markdown: 'test',
      clearanceStatus: 'pending',
    })
  }

  it('writes the durable request in the approval and queues one dispatcher, however often it re-approves', async () => {
    const postId = await pendingPost('clearance-request')
    await setPostModerationComplete(postId, false)
    await setPostSpamDetectionComplete(postId, false)

    await checkPostClearance(postId)

    const [request, ...rest] = await getClassifierRunRequestFacts(postId, POST_CLASSIFIER_SLUG)
    expect(rest).toEqual([])
    expect(request).toMatchObject({ run_id: null, no_work_at: null, stale_at: null })
    expect(request?.input_sha256.equals(await getPostClassifierPostHashForTest(postId))).toBe(true)
    const [dispatcher, ...others] = await readClassifierRunDispatcherJobsForTest(postId)
    expect(others).toEqual([])
    expect(dispatcher?.data).toEqual({
      classifier: POST_CLASSIFIER_SLUG,
      postId,
      rssFeedItemId: null,
    })

    await resetPostClearance(postId, userId)
    await setPostSpamDetectionComplete(postId, false)
    await setPostModerationComplete(postId, false)
    await checkPostClearance(postId)

    expect(await getClassifierRunRequestFacts(postId, POST_CLASSIFIER_SLUG)).toHaveLength(1)
    expect(await readClassifierRunDispatcherJobsForTest(postId)).toHaveLength(1)
  })

  it('approves and keeps the request when no classifier configuration is involved', async () => {
    // Approval never reads classifier configuration, so a missing or unresolvable one cannot block
    // it: the request is written regardless and the dispatcher, not approval, decides there is no work.
    const postId = await pendingPost('clearance-unconfigured')
    await setPostModerationComplete(postId, false)
    await setPostSpamDetectionComplete(postId, false)

    await expect(checkPostClearance(postId)).resolves.toBeUndefined()

    expect(await getClassifierRunRequestFacts(postId, POST_CLASSIFIER_SLUG)).toHaveLength(1)
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
