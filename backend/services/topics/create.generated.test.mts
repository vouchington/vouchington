import { randomUUID } from 'node:crypto'
import { onTestFinished, it, expect, describe, vi } from 'vitest'
import { ENTITY_LISTENERS_TOPIC_CREATED_JOB } from '@queues/background/enqueues/entity-listeners-jobs'
import { NOTIFICATIONS_RECONCILE_POST_JOB } from '@queues/background/enqueues/notifications-jobs'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import { notifications } from '@queues/notifications/queues'
import { getTopicByAny } from './get.mts'
import { createTopic } from './create.mts'
import { createUnlinkedTopicAlias } from './aliases.mts'
import {
  createTestPost,
  createTestUser,
  createTopHashtagPostSourceForTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import {
  holdQueueAdmission,
  holdQueueBulkAdmission,
} from '@voucha/test-helpers/queue-admission-hold'
import { readEnqueuedJob, removeEnqueuedJobs } from '@voucha/test-helpers/queue-jobs'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'

describe('create.generated', () => {
  it('createTopic', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topic = await createTopic(user!, WEB_PROVENANCE, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    expect(topic).toBeDefined()
  })

  it('waits for topic-created admission after the topic commits', async () => {
    const user = await createTestUser({ administrator: true })
    const slug = `topic-admission-${randomUUID()}`
    const queueGate = holdQueueAdmission(
      entitiesListeners,
      ENTITY_LISTENERS_TOPIC_CREATED_JOB.name,
      data =>
        typeof data === 'object' &&
        data !== null &&
        'updates' in data &&
        typeof data.updates === 'object' &&
        data.updates !== null &&
        'slug' in data.updates &&
        data.updates.slug === slug,
    )
    let creation: ReturnType<typeof createTopic> | undefined
    let settled = false
    let gateEntered = false
    let cleanupPromise: Promise<void> | undefined
    const cleanup = () => {
      cleanupPromise ??= (async () => {
        queueGate.release()
        try {
          await creation?.catch(() => undefined)
          if (gateEntered) {
            const job = await queueGate.admitted.catch(() => null)
            if (job?.id) await (await entitiesListeners.getJob(job.id))?.remove()
          }
        } finally {
          queueGate.restore()
        }
      })()
      return cleanupPromise
    }
    onTestFinished(cleanup)

    creation = createTopic(user!, WEB_PROVENANCE, {
      name: `Topic admission boundary ${slug}`,
      slug,
    }).finally(() => {
      settled = true
    })

    try {
      const firstEvent = await Promise.race([
        queueGate.entered.then(() => 'admission-entered'),
        creation.then(
          () => 'creation-settled',
          () => 'creation-rejected',
        ),
      ])
      expect(firstEvent).toBe('admission-entered')
      gateEntered = true
      const committed = await getTopicByAny(slug)
      expect(committed).toMatchObject({ slug })
      expect(settled).toBe(false)

      queueGate.release()
      const admitted = await queueGate.admitted
      expect(admitted).not.toBeNull()
      const created = await creation
      expect(created.id).toBe(committed?.id)
      expect(await readEnqueuedJob(entitiesListeners, admitted)).toMatchObject({
        name: ENTITY_LISTENERS_TOPIC_CREATED_JOB.name,
        data: { id: created.id, updates: { slug } },
      })
    } finally {
      await cleanup()
    }
  })

  it('keeps the committed topic when topic-created admission fails', async () => {
    const user = await createTestUser({ administrator: true })
    const slug = `topic-admission-failure-${randomUUID()}`
    const admissionError = new Error('Injected topic-created queue admission failure')
    const originalAdd = entitiesListeners.add
    const reportsBefore = sentryCaptureExceptionMock.mock.calls.length
    let matchingAdmissions = 0
    const addSpy = vi.spyOn(entitiesListeners, 'add').mockImplementation((name, data, options) => {
      if (
        name === ENTITY_LISTENERS_TOPIC_CREATED_JOB.name &&
        typeof data === 'object' &&
        data !== null &&
        'updates' in data &&
        typeof data.updates === 'object' &&
        data.updates !== null &&
        'slug' in data.updates &&
        data.updates.slug === slug
      ) {
        matchingAdmissions += 1
        return Promise.reject(admissionError)
      }
      return originalAdd.call(entitiesListeners, name, data, options)
    })

    try {
      const topic = await createTopic(user!, WEB_PROVENANCE, {
        name: `Topic admission failure boundary ${slug}`,
        slug,
      })

      expect(await getTopicByAny(topic.id)).toMatchObject({ id: topic.id, slug })
      expect(matchingAdmissions).toBe(1)
      expect(
        sentryCaptureExceptionMock.mock.calls
          .slice(reportsBefore)
          .filter(([reportedError]) => reportedError === admissionError),
      ).toHaveLength(1)
    } finally {
      addSpy.mockRestore()
    }
  })

  it('waits for an alias post-notification admission after the topic commits', async () => {
    const user = await createTestUser({ administrator: true })
    const slug = `topic-alias-admission-${randomUUID()}`
    const alias = await createUnlinkedTopicAlias(`source-${slug}`)
    const post = await createTestPost({ user, title: slug })
    await createTopHashtagPostSourceForTest({
      postId: post.id,
      topicAliasId: alias.id,
      userId: user.id,
      authoredToken: `#${slug}`,
    })
    const queueGate = holdQueueBulkAdmission(
      notifications,
      NOTIFICATIONS_RECONCILE_POST_JOB.name,
      data =>
        typeof data === 'object' && data !== null && 'postId' in data && data.postId === post.id,
    )
    let creation: ReturnType<typeof createTopic> | undefined
    let settled = false
    let gateEntered = false
    let cleanupPromise: Promise<void> | undefined
    const cleanup = () => {
      cleanupPromise ??= (async () => {
        queueGate.release()
        try {
          await creation?.catch(() => undefined)
          if (gateEntered)
            await removeEnqueuedJobs(
              [queueGate.admitted.catch(() => [])],
              NOTIFICATIONS_RECONCILE_POST_JOB.name,
            )
        } finally {
          queueGate.restore()
        }
      })()
      return cleanupPromise
    }
    onTestFinished(cleanup)

    creation = createTopic(user, WEB_PROVENANCE, {
      name: slug,
      slug,
      source_topic_alias_id: alias.id,
    }).finally(() => {
      settled = true
    })

    try {
      const firstEvent = await Promise.race([
        queueGate.entered.then(() => 'admission-entered'),
        creation.then(
          () => 'creation-settled',
          () => 'creation-rejected',
        ),
      ])
      expect(firstEvent).toBe('admission-entered')
      gateEntered = true
      expect(await getTopicByAny(slug)).toMatchObject({ slug })
      expect(settled).toBe(false)

      queueGate.release()
      const admitted = await queueGate.admitted
      expect(admitted).toHaveLength(1)
      const created = await creation
      expect(created.slug).toBe(slug)
      expect(await readEnqueuedJob(notifications, admitted[0])).toMatchObject({
        name: NOTIFICATIONS_RECONCILE_POST_JOB.name,
        data: { postId: post.id },
      })
    } finally {
      await cleanup()
    }
  })

  it('createTopic with hostname string resolves and links hostname', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const hostname = `create-test-${random}.example.com`
    const topic = await createTopic(user!, WEB_PROVENANCE, {
      name: `Hostname Topic ${random}`,
      slug: `hostname-topic-${random}`,
      hostname,
    })
    expect(topic).toBeDefined()
    expect(topic.hostname_id).not.toBeNull()
    expect(topic.hostname?.hostname).toBe(hostname)
  })

  it('createTopic with hostname null leaves topic unlinked', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topic = await createTopic(user!, WEB_PROVENANCE, {
      name: `No Hostname Topic ${random}`,
      slug: `no-hostname-topic-${random}`,
      hostname: null,
    })
    expect(topic).toBeDefined()
    expect(topic.hostname_id).toBeNull()
  })
})
