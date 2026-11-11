import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  isTestCopyrightCaseEvidenceErased,
  associateCopyrightEmailAfterErasure,
  createCopyrightNoticeForManualAssociation,
  purgeCopyrightCaseAfterEmailLink,
  readCopyrightEmailManualAssociationEvent,
} from '@voucha/test-helpers/copyright-email-manual-association'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import {
  copyrightEmailMessageId,
  recordThreadedCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { associateCopyrightEmailIntakeWithNotice } from './email-manual-association.mts'
import { runCopyrightCasePurgePage } from './retention-case-purge-page.mts'

const purgeNow = new Date('2100-01-01T12:00:00.000Z')

async function createReply() {
  return recordThreadedCopyrightEmail({
    messageId: copyrightEmailMessageId(),
    replyReferences: [copyrightEmailMessageId()],
  })
}

describe('copyright association and erasure final states', () => {
  it('rolls back the link and audit when an erasure wins after the association preflight', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const { intakeId } = await createReply()
    const noticeId = await createCopyrightNoticeForManualAssociation()
    await expect(
      associateCopyrightEmailAfterErasure(noticeId, () =>
        associateCopyrightEmailIntakeWithNotice(moderator, intakeId, noticeId),
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: 'copyright_email_thread_changed',
      cause: { constraint: 'copyright_email_link_active_case' },
    })
    expect(await readCopyrightEmailIntakeNoticeLinks(intakeId)).toEqual([])
    expect(await readCopyrightEmailManualAssociationEvent(intakeId)).toEqual([])
    expect(await isTestCopyrightCaseEvidenceErased(noticeId)).toBe(true)
  })

  it('restarts a selected marker page when the competing link advances the existing legal clock', async () => {
    const { intakeId } = await createReply()
    const noticeId = await createCopyrightNoticeForManualAssociation()
    const before = await runCopyrightCasePurgePage(
      {
        noticeId,
        phase: 'parties',
        phaseIndex: 0,
        afterId: null,
        legalClockAt: null,
        proofVersion: null,
      },
      purgeNow,
    )
    const after = await purgeCopyrightCaseAfterEmailLink(intakeId, noticeId, () =>
      runCopyrightCasePurgePage({ ...before.data, phase: 'evidence', phaseIndex: 2 }, purgeNow),
    )
    expect(after.data.phase).toBe('parties')
    expect(await isTestCopyrightCaseEvidenceErased(noticeId)).toBe(false)
    expect(await readCopyrightEmailIntakeNoticeLinks(intakeId)).toEqual([
      { copyright_notice_id: noticeId, link_kind: 'thread' },
    ])
  })
})
