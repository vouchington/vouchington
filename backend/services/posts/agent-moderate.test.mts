import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  createSystemUser,
  createTestUser,
  getTestPostDeletedAt,
  insertTestPost,
} from '@voucha/test-helpers'
import { MODERATION_SYSTEM_USERNAME } from '@services/users/constants'
import {
  createTestPostDeliveryFixture,
  expectTestPostDeliveryRestored,
} from '@voucha/test-helpers/media-delivery-post'
import { removeCommentAsAgent } from './agent-moderate.mts'
import { ENTITY_LISTENERS_POST_DELETED_JOB } from '@queues/background/enqueues/entity-listeners-jobs'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import { holdQueueAdmission } from '@voucha/test-helpers/queue-admission-hold'
import { readEnqueuedJob, removeEnqueuedJobs } from '@voucha/test-helpers/queue-jobs'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'

describe('agent comment removal delivery recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('keeps the comment and restores delivery when removal invalidation fails', async () => {
    await createSystemUser(MODERATION_SYSTEM_USERNAME)
    const fixture = await createTestPostDeliveryFixture('comment')
    const failure = new Error('Agent comment removal invalidation unavailable')
    fixture.edge.invalidatePath.mockRejectedValueOnce(failure)

    await expect(removeCommentAsAgent(fixture.postId)).rejects.toBe(failure)

    await expectTestPostDeliveryRestored(fixture)
  })

  it('waits for post-deleted admission after the comment commits', async () => {
    await createSystemUser(MODERATION_SYSTEM_USERNAME)
    const user = await createTestUser()
    const suffix = crypto.randomUUID()
    const rootId = await insertTestPost({
      title: `Admission thread ${suffix}`,
      slug: `admission-thread-${suffix}`,
      createdById: user.id,
      markdown: 'Root post',
    })
    const commentId = await insertTestPost({
      title: `Admission comment ${suffix}`,
      slug: `admission-comment-${suffix}`,
      createdById: user.id,
      markdown: 'Comment body',
      postType: 'comment',
      rootId,
      parentId: rootId,
    })
    const gate = holdQueueAdmission(
      entitiesListeners,
      ENTITY_LISTENERS_POST_DELETED_JOB.name,
      data => typeof data === 'object' && data !== null && 'id' in data && data.id === commentId,
    )
    let removing: ReturnType<typeof removeCommentAsAgent> | undefined
    let settled = false
    let entered = false
    void gate.entered.then(() => {
      entered = true
    })
    let cleanupPromise: Promise<void> | undefined
    const cleanup = () => {
      cleanupPromise ??= (async () => {
        gate.release()
        try {
          await removing?.catch(() => undefined)
          if (entered)
            await removeEnqueuedJobs(
              [gate.admitted.catch(() => [])],
              ENTITY_LISTENERS_POST_DELETED_JOB.name,
            )
        } finally {
          gate.restore()
        }
      })()
      return cleanupPromise
    }
    onTestFinished(cleanup)
    removing = removeCommentAsAgent(commentId).finally(() => {
      settled = true
    })
    try {
      expect(
        await Promise.race([
          gate.entered.then(() => 'admission-entered'),
          removing.then(() => 'removal-settled'),
        ]),
      ).toBe('admission-entered')
      await expect(getTestPostDeletedAt(commentId)).resolves.toBeInstanceOf(Date)
      expect(settled).toBe(false)
      gate.release()
      await expect(removing).resolves.toBe('removed')
      expect(await readEnqueuedJob(entitiesListeners, await gate.admitted)).toMatchObject({
        name: ENTITY_LISTENERS_POST_DELETED_JOB.name,
        data: { id: commentId },
      })
    } finally {
      await cleanup()
    }
  })

  it('keeps the removed result when post-deleted admission rejects', async () => {
    await createSystemUser(MODERATION_SYSTEM_USERNAME)
    const user = await createTestUser()
    const suffix = crypto.randomUUID()
    const rootId = await insertTestPost({
      title: `Rejection thread ${suffix}`,
      slug: `rejection-thread-${suffix}`,
      createdById: user.id,
      markdown: 'Root post',
    })
    const commentId = await insertTestPost({
      title: `Rejection comment ${suffix}`,
      slug: `rejection-comment-${suffix}`,
      createdById: user.id,
      markdown: 'Comment body',
      postType: 'comment',
      rootId,
      parentId: rootId,
    })
    const failure = new Error(`Agent deletion admission ${suffix}`)
    const originalAdd = entitiesListeners.add
    let matchingAdmissions = 0
    const spy = vi.spyOn(entitiesListeners, 'add').mockImplementation((name, data, options) => {
      if (
        name === ENTITY_LISTENERS_POST_DELETED_JOB.name &&
        typeof data === 'object' &&
        data !== null &&
        'id' in data &&
        data.id === commentId
      ) {
        matchingAdmissions += 1
        return Promise.reject(failure)
      }
      return originalAdd.call(entitiesListeners, name, data, options)
    })
    onTestFinished(() => spy.mockRestore())

    await expect(removeCommentAsAgent(commentId)).resolves.toBe('removed')

    await expect(getTestPostDeletedAt(commentId)).resolves.toBeInstanceOf(Date)
    expect(matchingAdmissions).toBe(1)
    expect(
      sentryCaptureExceptionMock.mock.calls.filter(([reported]) => reported === failure),
    ).toHaveLength(1)
  })
})
