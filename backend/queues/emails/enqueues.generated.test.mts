import {
  enqueueSendCommunityInviteEmail,
  enqueueSendCopyrightNoticeEmail,
  enqueueSendDataExportReadyEmail,
  enqueueSendEmailAddressLoginToken,
  enqueueSendEmailVerificationToken,
  enqueueSendReauthenticationToken,
  enqueueSendWelcomeEmail,
} from './enqueues.mts'
import { describe, expect, it } from 'vitest'
import { readEnqueuedJob } from '@voucha/test-helpers'
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
      processSendReauthenticationToken: () =>
        enqueueSendReauthenticationToken(input, { token: 'ABCDEFG234', expiresInMinutes: 15 }),
      processSendEmailVerificationToken: () =>
        enqueueSendEmailVerificationToken(input, { token: 'ABC123' }),
      processSendCommunityInviteEmail: () =>
        enqueueSendCommunityInviteEmail(input, {
          communityName: 'Test Community',
          inviterName: 'Test User',
          code: 'a3f9c2e1',
        }),
    }

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

    it('removes every recipient email payload after its terminal outcome', async () => {
      const enqueued = await enqueueSendWelcomeEmail(
        { userId: crypto.randomUUID() },
        { userName: 'Test User' },
      )

      expect(await readEnqueuedJob(emails, enqueued)).toMatchObject({
        name: 'processSendWelcomeEmail',
        opts: { removeOnComplete: true, removeOnFail: true },
      })
    })

    it('enqueues a data-export notification by request id without a download URL', async () => {
      const requestId = crypto.randomUUID()
      const exportInput = { userId: crypto.randomUUID(), uiLocale: 'fr' }
      const job = await readEnqueuedJob(
        emails,
        await enqueueSendDataExportReadyEmail(exportInput, { requestId }),
      )

      expect(job).toMatchObject({
        name: 'processSendDataExportReadyEmail',
        data: { input: exportInput, variables: { requestId } },
        opts: {
          priority: 0,
          removeOnComplete: true,
          removeOnFail: true,
          jobId: `data-export-ready__${requestId}`,
          deduplication: { id: `data-export-ready__${requestId}`, mode: 'simple' },
        },
      })
      expect(JSON.stringify(job?.data)).not.toMatch(/downloadUrl|signature|X-Amz-/)
    })

    it('removes copyright notification email jobs after their terminal outcome', async () => {
      const enqueued = await enqueueSendCopyrightNoticeEmail(crypto.randomUUID())

      expect(await readEnqueuedJob(emails, enqueued)).toMatchObject({
        name: 'processSendCopyrightNoticeEmail',
        opts: { removeOnComplete: true, removeOnFail: true },
      })
    })
  })
})
