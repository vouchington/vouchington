import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { holdQueueAdmission } from '@voucha/test-helpers/queue-admission-hold'
import { readEnqueuedJob, removeEnqueuedJobs } from '@voucha/test-helpers/queue-jobs'
import { ENTITY_LISTENERS_TOPIC_UPDATED_JOB } from '@queues/background/enqueues/entity-listeners-jobs'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { getTopicByAny } from './get.mts'
import { updateTopic } from './update.mts'

describe('owned topic update admission', () => {
  it('waits for topic-updated admission after the update commits', async () => {
    const user = await createTestUser({ administrator: true })
    const suffix = randomUUID()
    const topicId = await insertTestTopic({
      name: `Admission topic ${suffix}`,
      slug: `admission-topic-${suffix}`,
      createdById: user.id,
    })
    const topic = await getTopicByAny(topicId)
    if (!topic) throw new Error('Expected owned topic')
    const updatedName = `Committed admission topic ${suffix}`
    const gate = holdQueueAdmission(
      entitiesListeners,
      ENTITY_LISTENERS_TOPIC_UPDATED_JOB.name,
      data => typeof data === 'object' && data !== null && 'id' in data && data.id === topicId,
    )
    let updating: ReturnType<typeof updateTopic> | undefined
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
          await updating?.catch(() => undefined)
          if (entered)
            await removeEnqueuedJobs(
              [gate.admitted.catch(() => [])],
              ENTITY_LISTENERS_TOPIC_UPDATED_JOB.name,
            )
        } finally {
          gate.restore()
        }
      })()
      return cleanupPromise
    }
    onTestFinished(cleanup)
    updating = updateTopic(user, topic, { name: updatedName }).finally(() => {
      settled = true
    })
    try {
      expect(
        await Promise.race([
          gate.entered.then(() => 'admission-entered'),
          updating.then(() => 'update-settled'),
        ]),
      ).toBe('admission-entered')
      await expect(getTopicByAny(topicId)).resolves.toMatchObject({ name: updatedName })
      expect(settled).toBe(false)
      gate.release()
      await expect(updating).resolves.toMatchObject({ id: topicId, name: updatedName })
      expect(await readEnqueuedJob(entitiesListeners, await gate.admitted)).toMatchObject({
        name: ENTITY_LISTENERS_TOPIC_UPDATED_JOB.name,
        data: { id: topicId, updated_by_id: user.id },
      })
    } finally {
      await cleanup()
    }
  })

  it('keeps the committed update when topic-updated admission rejects', async () => {
    const user = await createTestUser({ administrator: true })
    const suffix = randomUUID()
    const topicId = await insertTestTopic({
      name: `Rejected admission topic ${suffix}`,
      slug: `rejected-admission-topic-${suffix}`,
      createdById: user.id,
    })
    const topic = await getTopicByAny(topicId)
    if (!topic) throw new Error('Expected owned topic')
    const updatedName = `Committed rejected admission ${suffix}`
    const failure = new Error(`Topic update admission ${suffix}`)
    const originalAdd = entitiesListeners.add
    let matchingAdmissions = 0
    const spy = vi.spyOn(entitiesListeners, 'add').mockImplementation((name, data, options) => {
      if (
        name === ENTITY_LISTENERS_TOPIC_UPDATED_JOB.name &&
        typeof data === 'object' &&
        data !== null &&
        'id' in data &&
        data.id === topicId
      ) {
        matchingAdmissions += 1
        return Promise.reject(failure)
      }
      return originalAdd.call(entitiesListeners, name, data, options)
    })
    onTestFinished(() => spy.mockRestore())

    await expect(updateTopic(user, topic, { name: updatedName })).resolves.toMatchObject({
      id: topicId,
      name: updatedName,
    })

    await expect(getTopicByAny(topicId)).resolves.toMatchObject({
      name: updatedName,
      updated_by: { id: user.id },
    })
    expect(matchingAdmissions).toBe(1)
    expect(
      sentryCaptureExceptionMock.mock.calls.filter(([reported]) => reported === failure),
    ).toHaveLength(1)
  })
})
