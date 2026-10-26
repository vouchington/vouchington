import { copyrightConfig } from '@services/copyright-notices/config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { withCopyrightStaffQueueHttp } from '@voucha/test-helpers/copyright-staff-queue-http'
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

const decisionNow = new Date(process.env.VOUCH_PROOF_NOW ?? '2026-10-06T12:00:00.000Z')
if (!Number.isFinite(decisionNow.getTime())) throw new Error('Invalid VOUCH_PROOF_NOW')

describe('copyright staff queue urgency', () => {
  useCopyrightIntakeEnvironment()

  let restorePriority: (() => void) | undefined
  beforeAll(async () => {
    await copyrightConfig.waitForInitialization()
    await copyrightConfig.close()
  }, 5_000)

  afterEach(() => {
    restorePriority?.()
    restorePriority = undefined
  })

  it('lists missed then due restoration deadlines ahead of older intake work across pages', async () => {
    restorePriority = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      trustedFlaggerPriority: false,
    })
    const fixture = await createCopyrightFormFixture()
    const target = fixture.form.targets[0]!
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const createGuestNotice = async (now: Date) => {
      const { intake } = await createCopyrightFormIntake(
        {
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
        },
        { now },
      )
      return intake.copyright_notice_id
    }
    // The plain intake has waited longest, so only urgency can put the deadline cases ahead of it.
    // Requester locks and notice IDs are independent; urgency timestamps own the expected order.
    const [olderIntake, due, missed, filingCase] = await Promise.all([
      createGuestNotice(new Date(decisionNow.getTime() - 30 * day)),
      createGuestNotice(decisionNow),
      createGuestNotice(decisionNow),
      createGuestNotice(decisionNow),
    ])
    const capability = await issueCopyrightGuestCapability({
      issuedAt: decisionNow,
      currentUser: moderator,
      noticeId: filingCase,
      expiresAt: new Date(decisionNow.getTime() + day),
    })
    await appendCopyrightGuestFiling({
      noticeId: filingCase,
      token: capability.token,
      now: decisionNow,
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
        now: decisionNow,
      })
    }
    // Eligible owned control interleaves between the due deadline and newer legal hold.
    const interleavingControl = await createGuestNotice(decisionNow)
    await insertReviewedCopyrightFormIntake({
      noticeId: interleavingControl,
      reviewerUserId: moderator.id,
    })
    await insertOpenCopyrightCounterNoticeDeadline({
      noticeId: interleavingControl,
      reviewerUserId: moderator.id,
      state: 'due',
      now: new Date(decisionNow.getTime() + 1),
    })
    const ownedIds = [missed, due, filingCase, olderIntake]
    // Newer plain intake. It sorts after the owned window, so a walk that
    // scans the shared queue tail reaches the global end instead of stopping.
    await createGuestNotice(decisionNow)
    await withCopyrightStaffQueueHttp(
      moderator,
      undefined,
      async ({ read, assertInterleaving }) => {
        await assertInterleaving(due, interleavingControl, filingCase, false)
        const first = await read(ownedIds, false, 100)
        expect(first.copyright_notices.map(item => item.id)).toEqual(ownedIds)
        const walked = await read(ownedIds, false, 1)
        const owned = walked.copyright_notices
        expect(new Set(owned.map(item => item.id)).size).toBe(owned.length)
        expect(walked.page_info.has_next_page).toBe(true)
        expect(walked.page_info.end_cursor).toEqual(expect.any(String))
        expect(owned.map(notice => notice.id)).toEqual(ownedIds)
        const [missedCase, dueCase, unassessedCase, intakeCase] = owned
        expect(missedCase).toMatchObject({
          reasons: ['deadline_missed'],
          next_deadline: {
            escalation_at: expect.any(String),
            restoration_deadline_at: expect.any(String),
          },
        })
        expect(Date.parse(missedCase!.next_deadline!.restoration_deadline_at)).toBeLessThan(
          decisionNow.getTime(),
        )
        expect(dueCase).toMatchObject({ reasons: ['deadline_due'] })
        expect(Date.parse(dueCase!.next_deadline!.escalation_at)).toBeLessThan(
          decisionNow.getTime(),
        )
        expect(Date.parse(dueCase!.next_deadline!.restoration_deadline_at)).toBeGreaterThan(
          decisionNow.getTime(),
        )
        expect(dueCase!.waiting_since).toBe(dueCase!.next_deadline!.escalation_at)
        expect(unassessedCase).toMatchObject({ id: filingCase, next_deadline: null })
        expect(unassessedCase!.reasons).toContain('legal_hold_review')
        expect(intakeCase).toMatchObject({ reasons: ['form_intake_review'], next_deadline: null })
        expect(Date.parse(intakeCase!.waiting_since)).toBeLessThan(
          Date.parse(missedCase!.waiting_since),
        )
      },
      decisionNow,
    )
  })
})
