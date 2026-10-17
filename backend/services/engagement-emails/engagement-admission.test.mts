import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { withOwnedEngagementAdmissions } from '@voucha/test-helpers/engagement-dispatch-jobs'
import { readEnqueuedJob } from '@voucha/test-helpers/queue-jobs'
import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { onEnqueueAdmission } from '../../data-stores/valkey-glide-mq/glide-mq-admission.mts'
import { emailDigests } from '@queues/email-digests/queues'
import { enqueueSendFollowTopicsEmail } from '@queues/email-digests/enqueues'
import * as ses from '../../modules/aws/ses.mts'

const variables = {
  topics: [{ name: 'Owned admission topic', url: 'https://example.com/topic' }],
  settingsUrl: 'https://example.com/settings',
  unsubscribeUrl: 'https://example.com/unsubscribe',
}

describe('owned engagement admission lifecycle', () => {
  it.each([
    { name: 'Error identity', primary: new Error('Owned callback failed') },
    { name: 'undefined rejection', primary: undefined },
  ])('retains raw $name after joining a real admission and restores SES', async ({ primary }) => {
    const user = await createTestUser()
    const original = ses.sendEmail
    const admissions: Promise<unknown>[] = []
    let completed = false
    let off = () => {}
    onTestFinished(() => {
      off()
    })
    off = onEnqueueAdmission(event => {
      if (event.queue === emailDigests && event.inputs.some(input => owns(input, user.id))) {
        admissions.push(event.completion)
        void event.completion.then(
          () => {
            completed = true
          },
          () => {
            completed = true
          },
        )
      }
      return undefined
    })
    const result = withOwnedEngagementAdmissions([user.id], async () => {
      void enqueueSendFollowTopicsEmail({ userId: user.id }, variables)
      return rejectRaw(primary)
    })
    await expect(result).rejects.toBe(primary)
    expect(completed).toBe(true)
    expect(admissions).toHaveLength(1)
    const job = await readEnqueuedJob(emailDigests, await admissions[0]!)
    expect(job.data).toEqual({ input: { userId: user.id }, variables })
    expect(ses.sendEmail).toBe(original)
    // The registered real finish hook must join without reporting this handled failure again.
  })

  it.each(['repeated identities', 'distinct phase order'])(
    'retains undefined primary cause and $0',
    async mode => {
      const user = await createTestUser()
      const shared = new Error('Repeated observer and reporter failure')
      const observers =
        mode === 'repeated identities'
          ? [shared, shared]
          : [new Error('First observer'), new Error('Second observer')]
      const reporter = mode === 'repeated identities' ? shared : undefined
      const previous = sentryCaptureExceptionMock.getMockImplementation()
      const detach: Array<() => void> = []
      const restore = () => {
        for (const off of detach.splice(0)) off()
        sentryCaptureExceptionMock.mockImplementation(previous ?? (() => undefined))
      }
      onTestFinished(restore)
      try {
        sentryCaptureExceptionMock.mockImplementation((...args) => {
          if (observers.some(observer => args[0] === observer)) {
            // oxlint-disable-next-line typescript/only-throw-error -- Deliberate synchronous provider fault verifies that raw undefined is retained, not converted to an Error.
            throw reporter
          }
          return previous?.(...args)
        })
        for (const observer of observers)
          detach.push(
            onEnqueueAdmission(event => {
              if (event.queue === emailDigests && event.inputs.some(input => owns(input, user.id)))
                throw observer
              return undefined
            }),
          )
        const result = withOwnedEngagementAdmissions([user.id], async () => {
          await enqueueSendFollowTopicsEmail({ userId: user.id }, variables)
          return rejectRaw(undefined)
        })
        await expect(result).rejects.toBeInstanceOf(AggregateError)
        const [settled] = await Promise.allSettled([result])
        if (settled!.status !== 'rejected' || !(settled!.reason instanceof AggregateError))
          throw new Error('Expected the owned aggregate')
        expect(Object.hasOwn(settled!.reason, 'cause')).toBe(true)
        expect(settled!.reason.cause).toBeUndefined()
        expect(settled!.reason.errors).toHaveLength(4)
        const expected = [...observers, reporter, reporter]
        expected.forEach((error, index) => {
          expect(settled!.reason.errors[index]).toBe(error)
        })
      } finally {
        restore()
      }
    },
  )

  it('joins an unawaited original admission and reads its exact owned job before restoring SES', async () => {
    const user = await createTestUser()
    const original = ses.sendEmail
    const observed = await withOwnedEngagementAdmissions([user.id], async () => {
      void enqueueSendFollowTopicsEmail({ userId: user.id }, variables)
      return user.id
    })
    expect(observed.value).toBe(user.id)
    expect(observed.jobs).toEqual([
      { name: 'email-digests.processSendFollowTopicsEmail', data: { input: { userId: user.id }, variables } },
    ])
    expect(ses.sendEmail).toBe(original)
  })
})

function owns(input: unknown, userId: string): boolean {
  if (typeof input !== 'object' || input === null || !('input' in input)) return false
  const recipient = input.input
  return (
    typeof recipient === 'object' &&
    recipient !== null &&
    'userId' in recipient &&
    recipient.userId === userId
  )
}

function rejectRaw(reason: unknown): Promise<never> {
  const rejection = Promise.withResolvers<never>()
  rejection.reject(reason)
  return rejection.promise
}
