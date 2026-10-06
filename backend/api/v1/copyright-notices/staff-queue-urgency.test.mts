import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { listCopyrightStaffQueuePage } from '@services/copyright-notices/staff-queue-page'
import {
  insertOpenCopyrightCounterNoticeDeadline,
  insertReviewedCopyrightFormIntake,
} from '@voucha/test-helpers/data-stores/psql/copyright-staff-queue'
import { createCopyrightFormFixture } from '@voucha/test-helpers/copyright-route-fixtures'
import {
  appendCopyrightGuestFiling,
  issueCopyrightGuestCapability,
  createCopyrightFormIntake,
} from '@services/copyright-notices'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'

const day = 24 * 60 * 60 * 1000

describe('copyright staff queue urgency', () => {
  useCopyrightIntakeEnvironment()

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists missed then due restoration deadlines ahead of older intake work across pages', async () => {
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
    const ownedIds = [missed, due, filingCase, olderIntake]
    const owned = []
    const endCursors: Array<string | null> = []
    let after: string | undefined
    let remaining = ownedIds.length
    while (remaining > 0) {
      remaining -= 1
      const page = await listCopyrightStaffQueuePage(moderator, {
        limit: 1,
        after,
        noticeIds: ownedIds,
      })
      owned.push(...page.copyright_notices)
      endCursors.push(page.page_info.end_cursor)
      if (!page.page_info.has_next_page) break
      after = page.page_info.end_cursor ?? undefined
    }
    expect(owned.map(notice => notice.id)).toEqual(ownedIds)
    expect(endCursors.at(-1)).toBeNull()
    const [missedCase, dueCase, unassessedCase, intakeCase] = owned
    expect(missedCase).toMatchObject({
      reasons: ['deadline_missed'],
      next_deadline: {
        escalation_at: expect.any(Date),
        restoration_deadline_at: expect.any(Date),
      },
    })
    expect(missedCase!.next_deadline!.restoration_deadline_at.getTime()).toBeLessThan(Date.now())
    expect(dueCase).toMatchObject({ reasons: ['deadline_due'] })
    expect(dueCase!.next_deadline!.escalation_at.getTime()).toBeLessThan(Date.now())
    expect(dueCase!.next_deadline!.restoration_deadline_at.getTime()).toBeGreaterThan(Date.now())
    expect(dueCase!.waiting_since.getTime()).toBe(dueCase!.next_deadline!.escalation_at.getTime())
    expect(unassessedCase).toMatchObject({ id: filingCase, next_deadline: null })
    expect(unassessedCase!.reasons).toContain('legal_hold_review')
    expect(intakeCase).toMatchObject({ reasons: ['form_intake_review'], next_deadline: null })
    expect(intakeCase!.waiting_since.getTime()).toBeLessThan(missedCase!.waiting_since.getTime())
  })
})
