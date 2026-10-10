import { afterEach, beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  insertOpenCopyrightCounterNoticeDeadline,
  insertReviewedCopyrightFormIntake,
} from '@voucha/test-helpers/data-stores/psql/copyright-staff-queue'
import { withCopyrightStaffQueueHttp } from '@voucha/test-helpers/copyright-staff-queue-http'
import {
  createTestCopyrightTrustedFlagger,
  readTestCopyrightTrustedFlaggerMatch,
  readTestTrustedFlaggerNoticeEffects,
} from '@voucha/test-helpers/copyright-trusted-flaggers'
import { createCopyrightFormFixture } from '@voucha/test-helpers/copyright-route-fixtures'
import { createCopyrightFormIntake } from '@services/copyright-notices'
import { copyrightConfig } from '@services/copyright-notices/config'
import { withdrawCopyrightJurisdictionPolicyApproval } from '@services/copyright-notices/jurisdiction-policy'
import {
  approveJurisdictionPolicy,
  seedPendingTerritorialNotice,
} from '@voucha/test-helpers/services/copyright-notices/territorial-routes'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { encodeScopedTierPreciseUuidCursor } from '@modules/pagination'

const priorQueueCursorScope = 'copyright-notices:staff-queue:urgency-asc-waiting-since-asc-id-asc'

const decisionNow = new Date(process.env.VOUCH_PROOF_NOW ?? '2026-10-06T12:00:00.000Z')
if (!Number.isFinite(decisionNow.getTime())) throw new Error('Invalid VOUCH_PROOF_NOW')

describe('trusted-flagger staff queue priority', () => {
  useCopyrightIntakeEnvironment()

  let restoreConfig: (() => void) | undefined

  beforeAll(async () => {
    await copyrightConfig.waitForInitialization()
    await copyrightConfig.close()
  }, 5_000)

  afterEach(() => {
    restoreConfig?.()
    restoreConfig = undefined
  })

  it('boosts only in-area EU matches within urgency tiers and pages with the new cursor', async () => {
    const administrator = await createTestUser({ administrator: true })
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    let ownedApprovalId: string | undefined
    // Register before approval/setup so every subsequent failure owns normal durable cleanup.
    onTestFinished(async () => {
      if (ownedApprovalId)
        await withdrawCopyrightJurisdictionPolicyApproval(administrator, ownedApprovalId)
    })
    const approval = await approveJurisdictionPolicy(administrator, 'eu_dsa')
    ownedApprovalId = approval.id
    const [unmatchedClaimant, inAreaClaimant, outOfAreaClaimant] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const unmatched = await seedPendingTerritorialNotice('eu_dsa', unmatchedClaimant)
    const interleavingClaimant = await createTestUser()
    const interleavingControl = await seedPendingTerritorialNotice('eu_dsa', interleavingClaimant)
    const inAreaFlagger = await createTestCopyrightTrustedFlagger(administrator, inAreaClaimant.id)
    const boosted = await seedPendingTerritorialNotice('eu_dsa', inAreaClaimant)
    const outOfAreaFlagger = await createTestCopyrightTrustedFlagger(
      administrator,
      outOfAreaClaimant.id,
      'other',
    )
    const outOfArea = await seedPendingTerritorialNotice('eu_dsa', outOfAreaClaimant)

    expect(await readTestCopyrightTrustedFlaggerMatch(boosted)).toEqual({
      flaggerId: inAreaFlagger.id,
      inArea: true,
    })
    expect(await readTestCopyrightTrustedFlaggerMatch(outOfArea)).toEqual({
      flaggerId: outOfAreaFlagger.id,
      inArea: false,
    })

    const fixture = await createCopyrightFormFixture()
    const target = fixture.form.targets[0]!
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
            surfaceKind: 'post-image',
            postId: target.post_id,
            imageId: target.image_id,
            hostedUseUrl: target.target_url,
          },
        ],
      },
    })
    const missed = intake.copyright_notice_id
    await insertReviewedCopyrightFormIntake({ noticeId: missed, reviewerUserId: moderator.id })
    await insertOpenCopyrightCounterNoticeDeadline({
      noticeId: missed,
      reviewerUserId: moderator.id,
      state: 'missed',
      now: decisionNow,
    })

    const ownedIds = [unmatched, boosted, outOfArea, missed]
    await withCopyrightStaffQueueHttp(
      moderator,
      {
        approvalId: approval.id,
        actor: administrator,
      },
      async ({ query, read, rejectPriorCursor, assertInterleaving }) => {
        restoreConfig = overrideDynamicConfigFieldsForTest(copyrightConfig, {
          trustedFlaggerPriority: false,
        })
        await assertInterleaving(unmatched, interleavingControl, boosted, false)
        const off = await read(ownedIds, false, 100)
        expect(off.copyright_notices.map(item => item.id)).toEqual([
          missed,
          unmatched,
          boosted,
          outOfArea,
        ])

        restoreConfig()
        restoreConfig = overrideDynamicConfigFieldsForTest(copyrightConfig, {
          trustedFlaggerPriority: true,
        })
        const on = await read(ownedIds, true, 100)
        expect(on.copyright_notices.map(item => item.id)).toEqual([
          missed,
          boosted,
          unmatched,
          outOfArea,
        ])
        expect(on.copyright_notices[0]).toMatchObject({ id: missed, reasons: ['deadline_missed'] })
        expect(on.copyright_notices[1]).toMatchObject({
          id: boosted,
          reasons: ['territorial_notice_review'],
        })
        const effects = await Promise.all(ownedIds.map(readTestTrustedFlaggerNoticeEffects))
        for (const effect of effects) {
          expect(effect).toEqual({
            hasDecision: false,
            hasRestriction: false,
          })
        }

        const walk = await read(ownedIds, true, 1)
        const walked = walk.copyright_notices.map(item => item.id)
        expect(walked).toEqual([missed, boosted, unmatched, outOfArea])
        expect(new Set(walked).size).toBe(walked.length)
        expect(walk.page_info.end_cursor).toBeNull()

        const priorCursor = encodeScopedTierPreciseUuidCursor(
          '2026-01-01T00:00:00.000000Z',
          2,
          crypto.randomUUID(),
          priorQueueCursorScope,
        )
        await rejectPriorCursor(priorCursor)

        expect(
          await withdrawCopyrightJurisdictionPolicyApproval(administrator, approval.id, { query }),
        ).toEqual({
          id: expect.any(String),
        })
        const afterWithdrawal = await read(ownedIds, false, 100)
        expect(afterWithdrawal.copyright_notices.map(item => item.id)).toEqual([
          missed,
          unmatched,
          boosted,
          outOfArea,
        ])
      },
      decisionNow,
    )
  })
})
