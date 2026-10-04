import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import {
  insertOpenCopyrightCounterNoticeDeadline,
  insertReviewedCopyrightFormIntake,
} from '@voucha/test-helpers/data-stores/psql/copyright-staff-queue'
import { createCopyrightFormFixture } from '@services/copyright-notices/route-test-fixtures'
import {
  appendCopyrightGuestFiling,
  issueCopyrightGuestCapability,
  createCopyrightFormIntake,
} from '@services/copyright-notices'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { getIsolatedDatabaseCaseMode } from '../../../../test-helpers/vitest-isolated-database-cases.mts'
import { runIsolatedDatabaseCase } from '../../../../test-helpers/vitest-isolated-database-case.mts'

const queuePath = '/api/v1/copyright-notices/review-queue'
const day = 24 * 60 * 60 * 1000

type QueuePage = {
  copyright_notices: Array<{
    id: string
    reasons: string[]
    waiting_since: string
    next_deadline: { escalation_at: string; restoration_deadline_at: string } | null
  }>
  page_info: { has_next_page: boolean; end_cursor: string | null }
}

describe('copyright staff queue urgency', () => {
  useCopyrightIntakeEnvironment()

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists missed then due restoration deadlines ahead of older intake work across pages', async () => {
    if (getIsolatedDatabaseCaseMode('copyright-staff-queue-urgency') === 'parent') {
      await runIsolatedDatabaseCase('copyright-staff-queue-urgency')
      return
    }
    const fixture = await createCopyrightFormFixture()
    const target = fixture.form.targets[0]!
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const createGuestNotice = async () => {
      const { intake } = await createCopyrightFormIntake({
        currentUser: null,
        requesterIdentity: `guest:${crypto.randomUUID()}`,
        idempotencyKey: crypto.randomUUID(),
        request: {
          jurisdiction: 'us_dmca',
          claimantDisplayName: 'Guest claimant',
          claimantContact: `claimant-${crypto.randomUUID()}@example.test`,
          claimantEmail: `claimant-${crypto.randomUUID()}@example.test`,
          workDescription: 'A photograph owned by the guest claimant.',
          goodFaithBelief: true,
          accuracyAuthorityUnderPenaltyOfPerjury: true,
          electronicSignature: 'Guest claimant',
          claimantTargets: [
            {
              surfaceKind: 'post-image' as const,
              postId: target.post_id,
              imageId: target.image_id,
              hostedUseUrl: target.target_url,
            },
          ],
        },
      })
      return intake.copyright_notice_id
    }
    // The plain intake has waited longest, so only urgency can put the deadline cases ahead of it.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(Date.now() - 30 * day))
    const olderIntake = await createGuestNotice()
    vi.useRealTimers()
    const due = await createGuestNotice()
    const missed = await createGuestNotice()
    const filingCase = await createGuestNotice()
    const capability = await issueCopyrightGuestCapability({
      currentUser: moderator,
      noticeId: filingCase,
      expiresAt: new Date(Date.now() + day),
    })
    await appendCopyrightGuestFiling({
      noticeId: filingCase,
      token: capability.token,
      now: new Date(),
      kind: 'court_or_ccb_hold',
      statement: 'An action has been filed.',
    })
    for (const [noticeId, state] of [
      [due, 'due'],
      [missed, 'missed'],
    ] as const) {
      await insertReviewedCopyrightFormIntake({ noticeId, reviewerUserId: moderator.id })
      await insertOpenCopyrightCounterNoticeDeadline({
        noticeId,
        reviewerUserId: moderator.id,
        state,
      })
    }
    const request = createRequest()
    await request.authenticateAs(moderator)

    const page = (await request.get(queuePath).expect(200)).body as QueuePage
    expect(page.copyright_notices.map(notice => notice.id)).toEqual([
      missed,
      due,
      filingCase,
      olderIntake,
    ])
    const [missedCase, dueCase, unassessedCase, intakeCase] = page.copyright_notices
    expect(missedCase).toMatchObject({
      reasons: ['deadline_missed'],
      next_deadline: {
        escalation_at: expect.any(String),
        restoration_deadline_at: expect.any(String),
      },
    })
    expect(Date.parse(missedCase!.next_deadline!.restoration_deadline_at)).toBeLessThan(Date.now())
    expect(dueCase).toMatchObject({ reasons: ['deadline_due'] })
    expect(Date.parse(dueCase!.next_deadline!.escalation_at)).toBeLessThan(Date.now())
    expect(Date.parse(dueCase!.next_deadline!.restoration_deadline_at)).toBeGreaterThan(Date.now())
    expect(dueCase!.waiting_since).toBe(dueCase!.next_deadline!.escalation_at)
    expect(unassessedCase).toMatchObject({ id: filingCase, next_deadline: null })
    expect(unassessedCase!.reasons).toContain('legal_hold_review')
    expect(intakeCase).toMatchObject({ reasons: ['form_intake_review'], next_deadline: null })
    expect(Date.parse(intakeCase!.waiting_since)).toBeLessThan(
      Date.parse(missedCase!.waiting_since),
    )

    const walked: string[] = []
    let after: string | null = null
    for (let pageCount = 0; pageCount < 4; pageCount += 1) {
      const path: string = after
        ? `${queuePath}?limit=1&after=${encodeURIComponent(after)}`
        : `${queuePath}?limit=1`
      const onePage = (await request.get(path).expect(200)).body as QueuePage
      walked.push(...onePage.copyright_notices.map(notice => notice.id))
      after = onePage.page_info.end_cursor
      if (!onePage.page_info.has_next_page) break
    }
    expect(walked).toEqual([missed, due, filingCase, olderIntake])
    expect(after).toBeNull()
  }, 240_000)
})
