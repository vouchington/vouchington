import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { withEntityListenerCompletion } from '@voucha/test-helpers/entity-listener-completion'
import { withEntityListenerAdmissionRead } from '@voucha/test-helpers/entity-listener-admission-read'
import { observeEntityListenerTerminals } from '@voucha/test-helpers/entity-listener-admissions'
import { createEnqueueFunction } from '../../../data-stores/valkey-glide-mq/glide-mq-enqueue.mts'
import { entitiesListeners } from '../../../queues/entity-listeners/queues.mts'
import { BACKGROUND_QUEUE_NAME } from '../../../queues/background/config.mts'
import { ENTITY_LISTENERS_POST_UPDATED_JOB } from '../../../queues/background/enqueues/entity-listeners-jobs.mts'
import { settlePostCommitEffects } from '../post-commit-completion.mts'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'

const enqueue = createEnqueueFunction<
  { id: string },
  typeof ENTITY_LISTENERS_POST_UPDATED_JOB.name
>({
  queue: entitiesListeners,
  queueName: BACKGROUND_QUEUE_NAME,
  jobName: ENTITY_LISTENERS_POST_UPDATED_JOB.name,
  defaults: ENTITY_LISTENERS_POST_UPDATED_JOB.options,
})

describe('owned entity listener completion', () => {
  it('joins the exact admitted job when its terminal arrives before admission inspection', async () => {
    const user = await createTestUser()
    const id = await insertTestPost({
      createdById: user.id,
      slug: `entity-buffer-${crypto.randomUUID()}`,
      title: 'Owned buffered entity',
      markdown: 'Owned buffered entity content',
    })
    const observer = observeEntityListenerTerminals()
    onTestFinished(() => observer.close())
    await observer.ready()
    let completedInsideAction = false
    const returned = await withEntityListenerCompletion(
      [{ jobName: 'processPostUpdated', entityId: id }],
      async () => {
        const job = await enqueue({ id })
        if (!job) throw new Error('Owned update was unexpectedly deduplicated')
        const terminal = await observer.wait(job.id)
        expect(terminal.failed).toBe(false)
        completedInsideAction = true
        return job.id
      },
      {
        release: () => {
          return observer.close()
        },
      },
    )
    expect(completedInsideAction).toBe(true)
    expect(returned).toEqual(expect.any(String))
  })

  it('rejects the original admission failure even when post-commit settlement keeps the durable result fulfilled', async () => {
    const user = await createTestUser()
    const slug = `entity-rejected-${crypto.randomUUID()}`
    const id = await insertTestPost({
      createdById: user.id,
      slug,
      title: 'Owned rejected entity',
      markdown: 'Owned rejected entity content',
    })
    type CircularPayload = { id: string; self?: CircularPayload }
    const circular: CircularPayload = { id }
    circular.self = circular
    let durableResultFulfilled = false
    let admissionFailure: unknown
    let admissionRejected = false
    const [outcome] = await Promise.allSettled([
      withEntityListenerCompletion(
        [{ jobName: 'processPostUpdated', postSlug: slug }],
        async () => {
          await settlePostCommitEffects([
            {
              start: () => {
                const admission = enqueue(circular)
                void admission.catch(err => {
                  admissionFailure = err
                  admissionRejected = true
                })
                return admission
              },
              isRejectionReported: () => true,
            },
          ])
          durableResultFulfilled = true
        },
      ),
    ])
    expect(durableResultFulfilled).toBe(true)
    expect(admissionRejected).toBe(true)
    expect(admissionFailure).toBeInstanceOf(Error)
    expect(
      sentryCaptureExceptionMock.mock.calls.filter(([err]) => err === admissionFailure),
    ).toHaveLength(1)
    expect(outcome!.status).toBe('rejected')
    if (outcome!.status !== 'rejected')
      throw new Error('Admission failure was incorrectly treated as completion')
    expect(outcome!.reason).toBeInstanceOf(AggregateError)
    expect(outcome!.reason.cause).toBe(admissionFailure)
    expect(outcome!.reason.errors).toContain(admissionFailure)
  })
  it('resumes dispatch before joining a held admission when the early writer observation rejects', async () => {
    const user = await createTestUser()
    const id = await insertTestPost({
      createdById: user.id,
      slug: `entity-held-${crypto.randomUUID()}`,
      title: 'Owned held admission',
      markdown: 'Owned held admission content',
    })
    const readFailure = new Error('Owned early writer read failed')
    let actionSettled = false
    let returnedId: string | undefined
    const [outcome] = await Promise.allSettled([
      withEntityListenerAdmissionRead(
        { jobName: 'processPostUpdated', entityId: id },
        async () => {
          const job = await enqueue({ id })
          if (!job) throw new Error('Owned held update was unexpectedly deduplicated')
          returnedId = job.id
          actionSettled = true
        },
        async () => {
          expect(actionSettled).toBe(false)
          throw readFailure
        },
      ),
    ])
    expect(outcome!.status).toBe('rejected')
    if (outcome!.status !== 'rejected') throw new Error('Expected early writer observation failure')
    expect(outcome!.reason).toBe(readFailure)
    expect(actionSettled).toBe(true)
    expect(returnedId).toEqual(expect.any(String))
    if (!returnedId) throw new Error('Held admission was not joined')
    const persisted = await entitiesListeners.getJob(returnedId)
    expect(persisted?.name).toBe(ENTITY_LISTENERS_POST_UPDATED_JOB.name)
    expect(persisted?.data).toEqual({ id })
    expect(await persisted?.getState()).toBe('completed')
  })
})
