import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  insertOpenCopyrightCounterNoticeDeadline,
  insertReviewedCopyrightFormIntake,
} from '@voucha/test-helpers/data-stores/psql/copyright-staff-queue'
import { listCopyrightStaffQueuePage } from '@services/copyright-notices/staff-queue-page'
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

const queuePath = '/api/v1/copyright-notices/review-queue'
const priorQueueCursorScope = 'copyright-notices:staff-queue:urgency-asc-waiting-since-asc-id-asc'

describe('trusted-flagger staff queue priority', () => {
  useCopyrightIntakeEnvironment()

  let restoreConfig: (() => void) | undefined

  beforeAll(async () => {
    await copyrightConfig.waitForInitialization()
    await copyrightConfig.close()
  })

  afterEach(() => {
    restoreConfig?.()
    restoreConfig = undefined
  })

  it('boosts only in-area EU matches within urgency tiers and pages with the new cursor', async () => {
    const administrator = await createTestUser({ administrator: true })
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const approval = await approveJurisdictionPolicy(administrator, 'eu_dsa')
    const [unmatchedClaimant, inAreaClaimant, outOfAreaClaimant] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const unmatched = await seedPendingTerritorialNotice('eu_dsa', unmatchedClaimant)
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
    })

    const ownedIds = [unmatched, boosted, outOfArea, missed]
    const request = createRequest()
    await request.authenticateAs(moderator)
    restoreConfig = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      trustedFlaggerPriority: false,
    })
    const off = await listCopyrightStaffQueuePage(moderator, {
      limit: ownedIds.length,
      noticeIds: ownedIds,
    })
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
    const on = await listCopyrightStaffQueuePage(moderator, {
      limit: ownedIds.length,
      noticeIds: ownedIds,
    })
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

    const walked: string[] = []
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
      walked.push(...page.copyright_notices.map(item => item.id))
      endCursors.push(page.page_info.end_cursor)
      if (!page.page_info.has_next_page) break
      after = page.page_info.end_cursor ?? undefined
    }
    expect(walked).toEqual([missed, boosted, unmatched, outOfArea])
    expect(new Set(walked).size).toBe(walked.length)
    expect(endCursors.at(-1)).toBeNull()

    const priorCursor = encodeScopedTierPreciseUuidCursor(
      '2026-01-01T00:00:00.000000Z',
      2,
      crypto.randomUUID(),
      priorQueueCursorScope,
    )
    await request.get(`${queuePath}?after=${encodeURIComponent(priorCursor)}`).expect(400)

    // Another unwithdrawn approval can stay current, so this does not assert boost-off order.
    expect(await withdrawCopyrightJurisdictionPolicyApproval(administrator, approval.id)).toEqual({
      id: expect.any(String),
    })
    const afterWithdrawal = await listCopyrightStaffQueuePage(moderator, {
      limit: ownedIds.length,
      noticeIds: ownedIds,
    })
    expect(afterWithdrawal.copyright_notices.map(item => item.id).toSorted()).toEqual(
      [...ownedIds].toSorted(),
    )
  })
})
