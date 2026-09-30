import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createCopyrightNoticeSchemaFixture } from '@voucha/test-helpers/data-stores/psql/copyright-notice-schema'
import {
  readCopyrightReviewTargetBreaches,
  rejectCopyrightEmailCorrespondence,
  rejectCopyrightEmailIntake,
} from './index.mts'
import {
  createParsedCopyrightEmailIntake,
  createUnparsedCopyrightEmailIntake,
} from './email-intake-test-fixtures.mts'
import { linkCopyrightEmailIntakeToNotice } from './email-threading.mts'

const HOUR_MS = 60 * 60 * 1000
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR_MS)
const noEmails = { count: 0, emailIntakeIds: [] }

async function createModerator() {
  const record = await createTestUser()
  return { ...record, roles: ['moderator'] } as typeof record
}

function readEmails(emailIntakeIds: string[], reviewTargetMinutes: number | null = 60) {
  return readCopyrightReviewTargetBreaches({ now: new Date(), reviewTargetMinutes, emailIntakeIds })
}

describe('readCopyrightReviewTargetBreaches email intakes', () => {
  it('counts emails waiting past the target, oldest first, and only while the target is set', async () => {
    const older = await createParsedCopyrightEmailIntake(hoursAgo(3))
    const newer = await createParsedCopyrightEmailIntake(hoursAgo(2))
    const recent = await createParsedCopyrightEmailIntake(new Date())
    const ids = [recent.id, newer.id, older.id]

    const breaches = await readEmails(ids)

    expect(breaches.emailIntakesWaitingPastTarget).toEqual({
      count: 2,
      emailIntakeIds: [older.id, newer.id],
    })
    expect(breaches.waitingPastTarget).toEqual({ count: 0, noticeIds: [] })
    expect((await readEmails(ids, null)).emailIntakesWaitingPastTarget).toEqual(noEmails)
  })

  it('counts an email whose parse never landed', async () => {
    const unparsed = await createUnparsedCopyrightEmailIntake(hoursAgo(2))

    expect((await readEmails([unparsed.id])).emailIntakesWaitingPastTarget).toEqual({
      count: 1,
      emailIntakeIds: [unparsed.id],
    })
  })

  it('stops counting an email once staff review it', async () => {
    const intake = await createParsedCopyrightEmailIntake(hoursAgo(2))
    await rejectCopyrightEmailIntake({
      currentUser: await createModerator(),
      intakeId: intake.id,
      recommendationId: null,
      manualFallbackReason: 'Manual review',
      rationale: 'Not a copyright notice',
    })

    expect((await readEmails([intake.id])).emailIntakesWaitingPastTarget).toEqual(noEmails)
  })

  it('counts a matched reply until staff decide its correspondence', async () => {
    const { noticeId } = await createCopyrightNoticeSchemaFixture()
    const reply = await createParsedCopyrightEmailIntake(hoursAgo(2))
    await linkCopyrightEmailIntakeToNotice({ intakeId: reply.id, noticeId, linkKind: 'thread' })

    expect((await readEmails([reply.id])).emailIntakesWaitingPastTarget.count).toBe(1)

    await rejectCopyrightEmailCorrespondence({
      currentUser: await createModerator(),
      intakeId: reply.id,
      kind: 'counter_notice',
      rationale: 'The message does not complete a counter-notice.',
      recommendationId: null,
      manualFallbackReason: 'Agent output is unavailable.',
    })

    expect((await readEmails([reply.id])).emailIntakesWaitingPastTarget).toEqual(noEmails)
  })
})
