import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getTestGooglePlayRtdnEvidenceTerminalState } from '@voucha/test-helpers/google-play-memberships-persistence'
import { createTestGooglePlayRtdnEvidence } from '@voucha/test-helpers/google-play-memberships'
import { findRecoverableGooglePlayNotificationJobs } from './notification-recovery.mts'

describe('Google Play notification recovery', () => {
  it('returns recoverable notifications, rejects malformed plaintext, and leaves undecryptable evidence retryable', async () => {
    const applicationId = `ai.voucha.recovery-${randomUUID()}`
    const purchaseToken = `token-${randomUUID()}`
    const validId = await createTestGooglePlayRtdnEvidence({
      applicationId,
      rawBody: rtdn(applicationId, `message-${randomUUID()}`, purchaseToken),
    })
    const ignoredId = await createTestGooglePlayRtdnEvidence({
      applicationId,
      rawBody: ignoredRtdn(applicationId, `message-${randomUUID()}`),
    })
    const malformedId = await createTestGooglePlayRtdnEvidence({
      applicationId,
      rawBody: Buffer.from('not an RTDN'),
    })
    const undecryptableId = await createTestGooglePlayRtdnEvidence({
      applicationId,
      rawBody: Buffer.from('not encrypted'),
      corruptEncryptedEvidence: true,
    })

    const batch = await findRecoverableGooglePlayNotificationJobs()

    expect(batch.notifications).toContainEqual({
      evidenceId: validId,
      purchaseToken,
      environment: 'test',
    })
    await expectTerminalRejection(ignoredId)
    await expectTerminalRejection(malformedId)
    await expect(
      getTestGooglePlayRtdnEvidenceTerminalState(undecryptableId),
    ).resolves.toMatchObject({
      rejectedAt: null,
      rejectionReason: null,
    })
  })
})

function rtdn(applicationId: string, messageId: string, purchaseToken: string): Buffer {
  return Buffer.from(
    JSON.stringify({
      message: {
        messageId,
        data: Buffer.from(
          JSON.stringify({
            packageName: applicationId,
            eventTimeMillis: String(Date.now()),
            subscriptionNotification: {
              purchaseToken,
              subscriptionId: 'plus',
              notificationType: 2,
            },
          }),
        ).toString('base64'),
      },
    }),
  )
}

function ignoredRtdn(applicationId: string, messageId: string): Buffer {
  return Buffer.from(
    JSON.stringify({
      message: {
        messageId,
        data: Buffer.from(
          JSON.stringify({ packageName: applicationId, testNotification: {} }),
        ).toString('base64'),
      },
    }),
  )
}

async function expectTerminalRejection(evidenceId: string): Promise<void> {
  await expect(getTestGooglePlayRtdnEvidenceTerminalState(evidenceId)).resolves.toMatchObject({
    rejectionReason: 'invalid_google_rtdn',
    rejectedAt: expect.any(Date),
  })
}
