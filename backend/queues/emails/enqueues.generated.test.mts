import {
  enqueueSendCommunityInviteEmail,
  enqueueSendDataExportReadyEmail,
  enqueueSendEmailAddressLoginToken,
  enqueueSendEmailVerificationToken,
  enqueueSendWelcomeEmail,
} from './enqueues.mts'
import { describe, expect, it } from 'vitest'
import { readEnqueuedJob } from '@voucha/test-helpers'
import { SECRET_BEARING_EMAIL_JOBS } from './enqueues/job-options.mts'
import { emails } from './queues.mts'

describe('enqueues.generated', () => {
  describe('enqueueSendEmailAddressLoginToken', () => {
    it('enqueues the login email with its recipient and template variables', async () => {
      const input = {
        emailAddress: 'tests@voucha.ai',
      }
      const variables = {
        token: '123456',
        expiration: '1 hour',
      }
      const enqueued = await enqueueSendEmailAddressLoginToken(input, variables)
      const job = await readEnqueuedJob(emails, enqueued)
      expect(job).toMatchObject({
        name: 'processSendEmailAddressLoginToken',
        data: { input, variables },
        opts: { priority: 0, removeOnComplete: true, removeOnFail: true },
      })
    })
  })

  describe('credential-bearing jobs', () => {
    const input = { emailAddress: 'tests@voucha.ai' }
    const credentialEnqueues = {
      processSendEmailAddressLoginToken: () =>
        enqueueSendEmailAddressLoginToken(input, { token: 'ABC123', expiration: '15 minutes' }),
      processSendEmailVerificationToken: () =>
        enqueueSendEmailVerificationToken(input, { token: 'ABC123' }),
      processSendCommunityInviteEmail: () =>
        enqueueSendCommunityInviteEmail(input, {
          communityName: 'Test Community',
          inviterName: 'Test User',
          code: 'a3f9c2e1',
        }),
      processSendDataExportReadyEmail: () =>
        enqueueSendDataExportReadyEmail(input, {
          downloadUrl: 'https://downloads.example/export.zip?signature=secret',
          expiresInDays: 7,
        }),
    }

    it('covers every job that carries a credential', () => {
      expect(Object.keys(credentialEnqueues).toSorted()).toEqual(
        [...SECRET_BEARING_EMAIL_JOBS].toSorted(),
      )
    })

    it.each(Object.entries(credentialEnqueues))(
      'drops a %s job as soon as it finishes, succeeded or failed',
      async (jobName, enqueue) => {
        const job = await readEnqueuedJob(emails, await enqueue())

        expect(job).toMatchObject({
          name: jobName,
          opts: { removeOnComplete: true, removeOnFail: true },
        })
      },
    )

    it('keeps the default retained history for an email that carries no credential', async () => {
      const enqueued = await enqueueSendWelcomeEmail(
        { userId: crypto.randomUUID() },
        { userName: 'Test User' },
      )

      expect(await readEnqueuedJob(emails, enqueued)).toMatchObject({
        name: 'processSendWelcomeEmail',
        opts: { removeOnComplete: 100, removeOnFail: 100 },
      })
    })
  })
})
