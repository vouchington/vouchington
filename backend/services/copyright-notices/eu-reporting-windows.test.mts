import { readEuFactRecordedAt } from '@voucha/test-helpers/data-stores/psql/copyright-eu-reports'
import { insertTestHistoricalTerritorialComplaint } from '@voucha/test-helpers/copyright-territorial-historical-complaint'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { createTestTimedDsaReportAction } from '@voucha/test-helpers/dsa-report-timed-action'
import { createTestHistoricalEuDecisionWindow } from '@voucha/test-helpers/copyright-territorial-historical-window'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { readDsaCopyrightNoticeFigures } from './eu-reporting-notices.mts'
import { readDsaCopyrightComplaintFigures } from './eu-reporting-complaints.mts'
import { recordEuCopyrightRedressDecision } from './eu-redress.mts'

const ARRIVED_AT = new Date('2024-01-31T23:59:59.999Z')

const after = (at: Date, ms: number) => new Date(at.getTime() + ms)

describe('DSA copyright half-open recorded-time windows', () => {
  useCopyrightIntakeEnvironment()

  it('counts a notice and its restriction by when Voucha recorded them, not by arrival', async () => {
    const noticeId = await createTestTimedDsaReportAction({
      receivedAt: ARRIVED_AT,
      imposedAt: after(ARRIVED_AT, 2_000),
      completedAt: after(ARRIVED_AT, 3_000),
    })
    const noticeAt = await readEuFactRecordedAt('notice', noticeId)
    const restrictionAt = await readEuFactRecordedAt('restriction', noticeId)
    const [arrival, before, at, restrictionBefore, restriction] = await Promise.all([
      readDsaCopyrightNoticeFigures(ARRIVED_AT, after(ARRIVED_AT, 1), [noticeId]),
      readDsaCopyrightNoticeFigures(after(noticeAt, -1), noticeAt, [noticeId]),
      readDsaCopyrightNoticeFigures(noticeAt, after(noticeAt, 1), [noticeId]),
      readDsaCopyrightNoticeFigures(after(restrictionAt, -1), restrictionAt, [noticeId]),
      readDsaCopyrightNoticeFigures(restrictionAt, after(restrictionAt, 1), [noticeId]),
    ])

    expect(arrival.notices_received_count).toBe(0)
    expect(before.notices_received_count).toBe(0)
    expect(at.notices_received_count).toBe(1)
    expect(restrictionBefore.actions_on_law_count).toBe(0)
    expect(restriction.actions_on_law_count).toBe(1)
  })

  it('counts a complaint and its decision by when Voucha recorded them', async () => {
    const [requester, staff] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    const scene = await createTestHistoricalEuDecisionWindow({
      requesterUserId: requester.id,
      decidedAt: after(ARRIVED_AT, -86_400_000),
    })
    const requestId = await insertTestHistoricalTerritorialComplaint({
      noticeId: scene.noticeId,
      requesterUserId: requester.id,
      idempotencyKey: crypto.randomUUID(),
      receivedAt: ARRIVED_AT,
    })
    const requestAt = await readEuFactRecordedAt('redress_request', requestId)
    await recordEuCopyrightRedressDecision(staff, scene.noticeId, requestId, {
      disposition: 'maintain',
      rationale: 'The original no-action decision remains appropriate.',
    })
    const decisionAt = await readEuFactRecordedAt('redress_decision', requestId)
    const [arrival, requestWindow, decisionBefore, decision] = await Promise.all([
      readDsaCopyrightComplaintFigures(ARRIVED_AT, after(ARRIVED_AT, 1), [scene.noticeId]),
      readDsaCopyrightComplaintFigures(requestAt, after(requestAt, 1), [scene.noticeId]),
      readDsaCopyrightComplaintFigures(after(decisionAt, -1), decisionAt, [scene.noticeId]),
      readDsaCopyrightComplaintFigures(decisionAt, after(decisionAt, 1), [scene.noticeId]),
    ])

    expect(arrival.complaints_by_submitter.notifier).toBe(0)
    expect(requestWindow.complaints_by_submitter.notifier).toBe(1)
    expect(requestWindow.complaints_by_decision_type.no_action.received).toBe(1)
    expect(decisionBefore.complaints_by_decision_type.no_action.upheld).toBe(0)
    expect(decision.complaints_by_decision_type.no_action.upheld).toBe(1)
  })
})
