import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createCopyrightEmailIntake,
  recordCopyrightEmailParse,
  rejectCopyrightEmailIntake,
  searchCopyrightStaffEmailIntakes,
} from './index.mts'

describe('searchCopyrightStaffEmailIntakes', () => {
  it('hides the queue from non-reviewers and lists unreviewed parsed intakes for staff', async () => {
    const [viewer, moderatorRecord] = await Promise.all([createTestUser(), createTestUser()])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const receivedAt = new Date()
    const pending = await createParsedIntake(receivedAt)
    const rejected = await createParsedIntake(new Date(receivedAt.getTime() + 1))
    await rejectCopyrightEmailIntake({
      currentUser: moderator,
      intakeId: rejected.id,
      recommendationId: null,
      manualFallbackReason: 'Manual review',
      rationale: 'Not a copyright notice',
    })
    // The queue is global and oldest-first, so seek just before this test's own intakes.
    const after = {
      timestamp: new Date(receivedAt.getTime() - 1).toISOString().replace(/Z$/, '000Z'),
      id: crypto.randomUUID(),
    }

    await expect(searchCopyrightStaffEmailIntakes(viewer, { limit: 100, after })).resolves.toEqual({
      intakes: [],
      hasNextPage: false,
    })
    const { intakes } = await searchCopyrightStaffEmailIntakes(moderator, { limit: 100, after })
    expect(intakes).toContainEqual(
      expect.objectContaining({
        id: pending.id,
        parse_status: 'succeeded',
        recommendation_id: null,
        review_path: 'initial',
        linked_notice_id: null,
      }),
    )
    expect(intakes.map(intake => intake.id)).not.toContain(rejected.id)
  })
})

async function createParsedIntake(receivedAt: Date) {
  const sesMessageId = `ses-staff-queue-${crypto.randomUUID()}`
  const { intake } = await createCopyrightEmailIntake({
    sesMessageId,
    receivedAt,
    rawStorageKey: `email/${sesMessageId}/original.eml`,
    rawSha256: Buffer.alloc(32, 8),
    rawMimeType: 'message/rfc822',
    rawByteSize: 12,
  })
  await recordCopyrightEmailParse(intake, {
    status: 'succeeded',
    fromEmail: `claimant-${crypto.randomUUID()}@example.test`,
    subject: 'Copyright complaint',
    bodyText: 'This is a copyright complaint.',
    messageId: `<${crypto.randomUUID()}@example.test>`,
    replyReferences: [],
    attachments: [],
  })
  return intake
}
