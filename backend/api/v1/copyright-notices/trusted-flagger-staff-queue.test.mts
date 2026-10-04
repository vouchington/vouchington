import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  insertOpenCopyrightCounterNoticeDeadline,
  insertReviewedCopyrightFormIntake,
} from '@voucha/test-helpers/data-stores/psql/copyright-staff-queue'
import { readCopyrightStaffQueueCursorBefore } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  createTestCopyrightTrustedFlagger,
  readTestCopyrightTrustedFlaggerMatch,
  readTestTrustedFlaggerNoticeEffects,
} from '@voucha/test-helpers/copyright-trusted-flaggers'
import { createCopyrightFormFixture } from '@services/copyright-notices/route-test-fixtures'
import { createCopyrightFormIntake } from '@services/copyright-notices'
import { copyrightConfig } from '@services/copyright-notices/config'
import { withdrawCopyrightJurisdictionPolicyApproval } from '@services/copyright-notices/jurisdiction-policy'
import {
  approveJurisdictionPolicy,
  seedPendingTerritorialNotice,
} from '@voucha/test-helpers/services/copyright-notices/territorial-routes'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { getIsolatedDatabaseCaseMode } from '../../../../test-helpers/vitest-isolated-database-cases.mts'
import { runIsolatedDatabaseCase } from '../../../../test-helpers/vitest-isolated-database-case.mts'
import { encodeScopedTierPreciseUuidCursor } from '@modules/pagination'

const queuePath = '/api/v1/copyright-notices/review-queue'
const priorQueueCursorScope = 'copyright-notices:staff-queue:urgency-asc-waiting-since-asc-id-asc'

type QueuePage = {
  copyright_notices: Array<{ id: string; reasons: string[] }>
  page_info: { has_next_page: boolean; end_cursor: string | null }
}

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
    if (getIsolatedDatabaseCaseMode('copyright-trusted-flagger-priority') === 'parent') {
      await runIsolatedDatabaseCase('copyright-trusted-flagger-priority')
      return
    }

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
    const offCursor = await readCopyrightStaffQueueCursorBefore(ownedIds)
    const off = (
      await request.get(`${queuePath}?after=${encodeURIComponent(offCursor)}`).expect(200)
    ).body as QueuePage
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
    const onCursor = await readCopyrightStaffQueueCursorBefore(ownedIds, {
      trustedFlaggerBoost: true,
    })
    const on = (await request.get(`${queuePath}?after=${encodeURIComponent(onCursor)}`).expect(200))
      .body as QueuePage
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
    let after: string | null = onCursor
    while (after && walked.length < ownedIds.length) {
      if (!after) break
      const page = (
        await request.get(`${queuePath}?limit=1&after=${encodeURIComponent(after)}`).expect(200)
      ).body as QueuePage
      walked.push(...page.copyright_notices.map(item => item.id))
      after = page.page_info.end_cursor
      if (!page.page_info.has_next_page) break
    }
    expect(walked).toEqual([missed, boosted, unmatched, outOfArea])
    expect(new Set(walked).size).toBe(walked.length)

    const priorCursor = encodeScopedTierPreciseUuidCursor(
      '2026-01-01T00:00:00.000000Z',
      2,
      crypto.randomUUID(),
      priorQueueCursorScope,
    )
    await request.get(`${queuePath}?after=${encodeURIComponent(priorCursor)}`).expect(400)

    await withdrawCopyrightJurisdictionPolicyApproval(administrator, approval.id)
    const withdrawnCursor = await readCopyrightStaffQueueCursorBefore(ownedIds)
    const afterWithdrawal = (
      await request.get(`${queuePath}?after=${encodeURIComponent(withdrawnCursor)}`).expect(200)
    ).body as QueuePage
    expect(afterWithdrawal.copyright_notices.map(item => item.id)).toEqual([
      missed,
      unmatched,
      boosted,
      outOfArea,
    ])
  }, 240_000)
})
