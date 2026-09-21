import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createCopyrightEmailIntake,
  listCopyrightStaffEmailIntakes,
  recordCopyrightEmailParse,
} from './index.mts'

describe('listCopyrightStaffEmailIntakes', () => {
  it('hides the queue from non-reviewers and lists unmatched parsed intakes for staff', async () => {
    const [viewer, moderatorRecord] = await Promise.all([createTestUser(), createTestUser()])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const sesMessageId = `ses-staff-queue-${crypto.randomUUID()}`
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
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
      messageId: '<copyright@example.test>',
      replyReferences: [],
      attachments: [],
    })
    await expect(listCopyrightStaffEmailIntakes(viewer)).resolves.toEqual([])
    await expect(listCopyrightStaffEmailIntakes(moderator)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: intake.id,
          parse_status: 'succeeded',
          review_path: 'initial',
          linked_notice_id: null,
        }),
      ]),
    )
  })
})
