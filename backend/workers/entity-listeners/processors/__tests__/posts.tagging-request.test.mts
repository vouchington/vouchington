import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { readClassifierRunDispatcherJobsForTest } from '@voucha/test-helpers/classifier-run-queue-jobs'
import { TAGGING_CLASSIFIER_SLUG } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { getClassifierRunRequestFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { processPostCreated } from '../posts.mts'

async function createPost(clearanceStatus: 'approved' | 'pending') {
  const creator = await createTestUser()
  return insertTestPost({
    title: `Tagging request post ${randomUUID()}`,
    slug: `tagging-request-post-${randomUUID()}`,
    createdById: creator.id,
    markdown: 'A post whose topics C6 tags.',
    clearanceStatus,
  })
}

describe('post entity listener requests C6 for a post created already approved', () => {
  it('writes the durable request and queues one dispatcher', async () => {
    const postId = await createPost('approved')

    await processPostCreated({ id: postId })
    await processPostCreated({ id: postId })

    expect(await getClassifierRunRequestFacts(postId, TAGGING_CLASSIFIER_SLUG)).toMatchObject([
      { run_id: null, no_work_at: null, stale_at: null },
    ])
    expect(await readClassifierRunDispatcherJobsForTest(postId)).toHaveLength(1)
  })

  it('leaves a pending post to the approval decision, which requests it later', async () => {
    const postId = await createPost('pending')

    await processPostCreated({ id: postId })

    expect(await getClassifierRunRequestFacts(postId)).toEqual([])
    expect(await readClassifierRunDispatcherJobsForTest(postId)).toEqual([])
  })
})
