import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestEuParticipantCase } from '@voucha/test-helpers/copyright-eu-participant-cases'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import {
  recordEuDisputeSettlementOutcome,
  recordEuDisputeSettlementReferral,
} from '@services/copyright-notices'

describe('EU case collection continuation', () => {
  useCopyrightIntakeEnvironment()

  it('pages every referral without duplicates and keeps participant and staff projections apart', async () => {
    const scene = await createTestEuParticipantCase('no_action')
    const noticeId = scene.receipt.notice_id
    const referredAt = new Date()
    const created: string[] = []
    for (let index = 0; index < 27; index++) {
      const referral = await recordEuDisputeSettlementReferral(scene.staff, noticeId, {
        bodyName: `Independent body ${index} ${scene.suffix}`,
        referredAt,
        referredByParty: 'notifier',
        referredByUserId: scene.notifier.id,
      })
      created.push(referral.id)
    }
    await recordEuDisputeSettlementOutcome(scene.staff, noticeId, created[0]!, {
      result: 'decided_for_platform',
      decidedAt: new Date(),
    })

    const participant = createRequest()
    await participant.authenticateAs(scene.notifier)
    const initial = await participant
      .get(`/api/v1/copyright-notices/${noticeId}/participant`)
      .expect(200)
    const eu = initial.body.copyright_notice.eu
    expect(eu.dispute_settlements).toHaveLength(25)
    expect(eu.dispute_settlements_page_info.has_next_page).toBe(true)
    expect(eu.dispute_settlements[0].outcome.result).toBe('decided_for_platform')
    expect(JSON.stringify(eu.dispute_settlements)).not.toContain('referred_by_id')

    const endpoint = `/api/v1/copyright-notices/${noticeId}/eu-dispute-settlements`
    const rest = await participant
      .get(endpoint)
      .query({ limit: 25, after: eu.dispute_settlements_page_info.end_cursor })
      .expect(200)
    expect(rest.body.copyright_eu_dispute_settlements).toHaveLength(2)
    expect(rest.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    const allIds = [...eu.dispute_settlements, ...rest.body.copyright_eu_dispute_settlements].map(
      (row: { id: string }) => row.id,
    )
    expect(allIds).toEqual(created.toSorted())
    expect(new Set(allIds).size).toBe(27)

    const staff = createRequest()
    await staff.authenticateAs(scene.staff)
    const audit = await staff
      .get(`/api/v1/copyright-notices/${noticeId}/eu-dispute-settlements/staff`)
      .query({ limit: 1 })
      .expect(200)
    expect(audit.body.copyright_eu_dispute_settlements[0]).toMatchObject({
      referred_by_party: 'notifier',
      referred_by_id: scene.notifier.id,
    })
    await participant.get(endpoint).query({ after: audit.body.page_info.end_cursor }).expect(400)
    await staff
      .get(`/api/v1/copyright-notices/${noticeId}/eu-dispute-settlements/staff`)
      .query({ after: eu.dispute_settlements_page_info.end_cursor })
      .expect(400)
  })

  it('rejects another viewer or case cursor, strangers, and invalid limits', async () => {
    const [first, second] = await Promise.all([
      createTestEuParticipantCase('no_action'),
      createTestEuParticipantCase('no_action'),
    ])
    const noticeId = first.receipt.notice_id
    for (let index = 0; index < 2; index++) {
      await recordEuDisputeSettlementReferral(first.staff, noticeId, {
        bodyName: `Body ${index} ${first.suffix}`,
        referredAt: new Date(),
        referredByParty: 'notifier',
        referredByUserId: first.notifier.id,
      })
    }
    const participant = createRequest()
    await participant.authenticateAs(first.notifier)
    const endpoint = `/api/v1/copyright-notices/${noticeId}/eu-dispute-settlements`
    const page = await participant.get(endpoint).query({ limit: 1 }).expect(200)
    const cursor = page.body.page_info.end_cursor
    expect(cursor).toEqual(expect.any(String))
    const staff = createRequest()
    await staff.authenticateAs(first.staff)
    await staff.get(endpoint).query({ after: cursor }).expect(400)
    const staffPage = await staff.get(endpoint).query({ limit: 1 }).expect(200)
    const otherStaff = createRequest()
    await otherStaff.authenticateAs(second.staff)
    await otherStaff.get(endpoint).query({ after: staffPage.body.page_info.end_cursor }).expect(400)
    const audit = `/api/v1/copyright-notices/${noticeId}/eu-dispute-settlements/staff`
    const auditPage = await staff.get(audit).query({ limit: 1 }).expect(200)
    await staff
      .get(`/api/v1/copyright-notices/${second.receipt.notice_id}/eu-dispute-settlements/staff`)
      .query({ after: auditPage.body.page_info.end_cursor })
      .expect(400)
    const stranger = createRequest()
    await stranger.authenticateAs(first.stranger)
    await stranger.get(endpoint).expect(403)
    await createRequest().get(endpoint).expect(401)
    await participant.get(endpoint).query({ limit: 0 }).expect(400)
    // The shared pagination parser caps oversized positive limits at its maximum.
    await participant.get(endpoint).query({ limit: 101 }).expect(200)
    await participant.get(endpoint).query({ after: 'not-a-cursor' }).expect(400)
  })
})
