import { read } from '@data-stores/psql'
import { insertTestHistoricalTerritorialComplaint } from '@voucha/test-helpers/copyright-territorial-historical-complaint'
import sql from 'sql-template-strings'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { createTestTimedDsaReportAction } from '@voucha/test-helpers/dsa-report-timed-action'
import { createTestHistoricalEuDecisionWindow } from '@voucha/test-helpers/copyright-territorial-historical-window'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { readDsaCopyrightNoticeFigures } from './eu-reporting-notices.mts'
import { readDsaCopyrightComplaintFigures } from './eu-reporting-complaints.mts'
import { recordEuCopyrightRedressDecision } from './eu-redress.mts'

const ARRIVED_AT = new Date('2024-01-31T23:59:59.999Z')

/** The millisecond Voucha recorded a row, from its UUIDv7 id. */
async function recordedAt(query: ReturnType<typeof sql>): Promise<Date> {
  const { rows } = await read<{ at: Date }>(query)
  const at = rows[0]?.at
  if (!at) throw new Error('Expected a recorded row')
  return at
}

const after = (at: Date, ms: number) => new Date(at.getTime() + ms)

describe('DSA copyright half-open recorded-time windows', () => {
  useCopyrightIntakeEnvironment()

  it('counts a notice and its restriction by when Voucha recorded them, not by arrival', async () => {
    const noticeId = await createTestTimedDsaReportAction({
      receivedAt: ARRIVED_AT,
      imposedAt: after(ARRIVED_AT, 2_000),
      completedAt: after(ARRIVED_AT, 3_000),
    })
    const noticeAt = await recordedAt(
      sql`/* readNoticeRecordedAt */ SELECT uuid_extract_timestamp(id) AS at
        FROM copyright_notices WHERE id = ${noticeId}`,
    )
    const restrictionAt = await recordedAt(
      sql`/* readRestrictionRecordedAt */ SELECT uuid_extract_timestamp(id) AS at
        FROM copyright_restrictions WHERE copyright_notice_id = ${noticeId}`,
    )
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
    const requestAt = await recordedAt(
      sql`/* readRedressRequestRecordedAt */ SELECT uuid_extract_timestamp(id) AS at
        FROM copyright_territorial_redress_requests WHERE id = ${requestId}`,
    )
    await recordEuCopyrightRedressDecision(staff, scene.noticeId, requestId, {
      disposition: 'maintain',
      rationale: 'The original no-action decision remains appropriate.',
    })
    const decisionAt = await recordedAt(
      sql`/* readRedressDecisionRecordedAt */ SELECT uuid_extract_timestamp(current_staff_decision_identity_id) AS at
        FROM copyright_territorial_redress_requests WHERE id = ${requestId}`,
    )
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
