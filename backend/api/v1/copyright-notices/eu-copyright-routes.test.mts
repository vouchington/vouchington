import {
  assertApiTerritorialAcknowledgmentFailure,
  assertApiNoActionRedressDecision,
} from '@voucha/test-helpers/copyright-api-territorial-staff-writes'
import {
  assertApiTerritorialRedress,
  seedApiTerritorialRedress,
} from '@voucha/test-helpers/copyright-api-territorial-redress'
import { assertTerritorialHttpDecisionOutcome } from '@voucha/test-helpers/copyright-territorial-http-decision-outcome'
import {
  seedDeterminedTerritorialNoticeForValidation,
  seedTerritorialRedress,
} from '@voucha/test-helpers/copyright-territorial-redress-seed'
import {
  readCopyrightApiTerritorialState,
  assertCopyrightApiEuComplaint,
} from '@voucha/test-helpers/copyright-api-territorial-request-outcomes'
import {
  seedApiEuComplaint,
  assertApiEuComplaintReplay,
} from '@voucha/test-helpers/copyright-api-eu-complaint-replay'
import { describe, expect, it } from 'vitest'
import { useDsaTransparencyReports } from '@voucha/test-helpers/dsa-switches'
import { receiveEuCopyrightNotice } from '@services/copyright-notices'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'

function noticeBody() {
  const suffix = crypto.randomUUID()
  return {
    contact: `claimant-${suffix}@example.test`,
    content_description: `Work ${suffix}`,
    grounds: `Grounds ${suffix}`,
    hosted_use_url: `https://example.test/${suffix}`,
    notifier_name: `Notifier ${suffix}`,
    notifier_email: `notifier-${suffix}@example.test`,
    has_good_faith_statement: true,
  }
}

function noticeRequest(body: ReturnType<typeof noticeBody>) {
  return {
    contact: body.contact,
    contentDescription: body.content_description,
    grounds: body.grounds,
    hostedUseUrl: body.hosted_use_url,
    notifierName: body.notifier_name,
    notifierEmail: body.notifier_email,
    goodFaithStatement: true as const,
  }
}

describe('EU copyright notice routes', () => {
  useCopyrightIntakeEnvironment()
  useDsaTransparencyReports()

  it('records acknowledgment failure, redress reuse, and the remaining EU handlers', async () => {
    const [claimant, staff, administrator] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser({ administrator: true }),
    ])
    const administratorRequest = createRequest()
    await administratorRequest.authenticateAs(administrator)
    await administratorRequest
      .post('/api/v1/copyright-jurisdiction-policies')
      .send({
        jurisdiction: 'eu_dsa',
        policy_version: `eu-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
      })
      .expect(201)
    const claimantRequest = createRequest()
    await claimantRequest.authenticateAs(claimant)
    const staffRequest = createRequest()
    await staffRequest.authenticateAs(staff)
    const pending = await receiveEuCopyrightNotice(
      { user: claimant, identity: `user:${claimant.id}` },
      crypto.randomUUID(),
      noticeRequest(noticeBody()),
    )
    await assertApiTerritorialAcknowledgmentFailure(staffRequest, 'eu_dsa', pending.notice_id)
    await staffRequest
      .post(`/api/v1/copyright-eu-notices/${crypto.randomUUID()}/statements-of-reasons`)
      .send({ statement: 1 })
      .expect(422)
    await staffRequest
      .post(
        `/api/v1/copyright-eu-notices/${crypto.randomUUID()}/redress-requests/${crypto.randomUUID()}/decisions`,
      )
      .send({ rationale: 'Missing disposition' })
      .expect(422)
    const periodStart = new Date(Date.now() - 60_000).toISOString()
    const closedStart = new Date(
      Date.now() -
        4 * 86_400_000 -
        (Number.parseInt(crypto.randomUUID().slice(0, 8), 16) % 3_600_000),
    ).toISOString()
    await staffRequest.post('/api/v1/copyright-eu-reports').send({ period_start: 1 }).expect(422)
    await staffRequest
      .post('/api/v1/copyright-eu-reports')
      .send({ period_start: periodStart, period_end: 1 })
      .expect(422)
    const createdBody = noticeBody()
    const created = await claimantRequest
      .post('/api/v1/copyright-eu-notices')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(createdBody)
      .expect(201)
    const createdId = created.body.copyright_eu_notice.notice_id as string
    await assertTerritorialHttpDecisionOutcome(
      'eu_dsa',
      {
        staff,
        claimant,
        claimantContact: createdBody.contact,
        noticeId: createdId,
        posts: [],
        targets: [],
      },
      {
        text: 'Staff statement of reasons',
        publicExplanation: 'The notice did not establish infringement.',
        outcome: 'no_action',
        targets: [],
      },
      staffRequest,
    )

    const noticeId = await seedDeterminedTerritorialNoticeForValidation('eu_dsa', {
      claimant,
      staff,
    })
    await assertApiTerritorialRedress({
      request: claimantRequest,
      jurisdiction: 'eu_dsa',
      noticeId,
      actorId: claimant.id,
      key: crypto.randomUUID(),
      explanation: 'Please review the restriction',
      filedBy: 'notifier',
    })
    // Exact replay and changed-owner guards always start from independently committed key facts.
    const replayNoticeId = await seedDeterminedTerritorialNoticeForValidation('eu_dsa', {
      claimant,
      staff,
    })
    const redressKey = crypto.randomUUID()
    const replayInput = {
      jurisdiction: 'eu_dsa' as const,
      noticeId: replayNoticeId,
      actorId: claimant.id,
      key: redressKey,
      explanation: 'Please review the restriction',
      filedBy: 'notifier' as const,
    }
    await seedApiTerritorialRedress(replayInput)
    await assertApiTerritorialRedress({ ...replayInput, request: claimantRequest, replay: true })
    const otherNoticeId = await seedDeterminedTerritorialNoticeForValidation('eu_dsa', {
      claimant,
      staff,
    })
    const beforeReuse = await readCopyrightApiTerritorialState(otherNoticeId)
    const originalKeyState = await readCopyrightApiTerritorialState(replayNoticeId)
    const reused = await claimantRequest
      .post(`/api/v1/copyright-eu-notices/${otherNoticeId}/redress-requests`)
      .set('Idempotency-Key', redressKey)
      .send({ explanation: 'Reuse the first key' })
      .expect(409)
    expect(reused.body.message).toBe('Idempotency-Key was reused')
    expect(await readCopyrightApiTerritorialState(otherNoticeId)).toEqual(beforeReuse)
    expect(await readCopyrightApiTerritorialState(replayNoticeId)).toEqual(originalKeyState)

    const decision = await seedTerritorialRedress('eu_dsa', { claimant, staff })
    await assertApiNoActionRedressDecision({
      request: staffRequest,
      jurisdiction: 'eu_dsa',
      noticeId: decision.noticeId,
      redressId: decision.redressId,
      actorId: staff.id,
      claimantId: claimant.id,
      disposition: 'revoke',
      rationale: 'Staff redress rationale',
    })
    const complaintUrl = `/api/v1/copyright-eu-notices/${noticeId}/supervised-complaints`
    const complaintBody = {
      authority_reference: `dsc-${crypto.randomUUID()}`,
      explanation: 'Complaint filed with the authority',
    }
    const beforeMissingKey = await readCopyrightApiTerritorialState(noticeId)
    await claimantRequest.post(complaintUrl).send(complaintBody).expect(400)
    expect(await readCopyrightApiTerritorialState(noticeId)).toEqual(beforeMissingKey)
    await assertCopyrightApiEuComplaint({
      request: claimantRequest,
      noticeId,
      actorId: claimant.id,
      key: crypto.randomUUID(),
      body: complaintBody,
    })

    const replayComplaintNoticeId = await seedDeterminedTerritorialNoticeForValidation('eu_dsa', {
      claimant,
      staff,
    })
    const complaintKey = crypto.randomUUID()
    const expectedComplaint = await seedApiEuComplaint({
      noticeId: replayComplaintNoticeId,
      actorId: claimant.id,
      key: complaintKey,
      authorityReference: complaintBody.authority_reference,
      explanation: complaintBody.explanation,
    })
    await assertApiEuComplaintReplay({
      request: claimantRequest,
      noticeId: replayComplaintNoticeId,
      key: complaintKey,
      body: complaintBody,
      expected: expectedComplaint,
    })
    const beforeChangedComplaint = await readCopyrightApiTerritorialState(replayComplaintNoticeId)
    const changedComplaint = await claimantRequest
      .post(`/api/v1/copyright-eu-notices/${replayComplaintNoticeId}/supervised-complaints`)
      .set('Idempotency-Key', complaintKey)
      .send({ ...complaintBody, explanation: 'A different complaint' })
      .expect(409)
    expect(changedComplaint.body.message).toBe(
      'Idempotency-Key was reused or that supervised complaint is already recorded',
    )
    expect(await readCopyrightApiTerritorialState(replayComplaintNoticeId)).toEqual(
      beforeChangedComplaint,
    )
    const report = await staffRequest
      .post('/api/v1/copyright-eu-reports')
      .send({
        period_start: closedStart,
        period_end: new Date(Date.parse(closedStart) + 1_000).toISOString(),
      })
      .expect(201)
    expect(report.body.copyright_eu_report).toMatchObject({
      id: expect.any(String),
      receipt_count: expect.any(Number),
    })
  })
})

describe('EU report switch off', () => {
  useDsaTransparencyReports(false)

  it('returns 404 before validating a staff POST body', async () => {
    const staff = await createTestUser({ extraRoles: ['moderator'] })
    const request = createRequest()
    await request.authenticateAs(staff)
    await request.post('/api/v1/copyright-eu-reports').send({ period_start: 1 }).expect(404)
  })
})
