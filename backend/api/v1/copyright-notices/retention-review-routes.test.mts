import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, suspendTestUser } from '@voucha/test-helpers/entities/users'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createRetentionReviewComplaintCase,
  markCopyrightReviewCaseExpired,
  readCopyrightRetentionReviewOutcomes,
} from '@voucha/test-helpers/copyright-retention-review-routes'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'

const casePath = (noticeId: string) => `/api/v1/copyright-notices/${noticeId}`

async function requestFor(user: Awaited<ReturnType<typeof createTestUser>>) {
  const request = createRequest()
  await request.authenticateAs(user)
  return request
}

describe('copyright retention review routes', () => {
  useCopyrightIntakeEnvironment()

  afterEach(() => vi.restoreAllMocks())

  it('requires an active copyright reviewer for each retention action', async () => {
    const fixture = await createRetentionReviewComplaintCase()
    const member = await requestFor(await createTestUser())
    const moderator = await requestFor(await createTestUser({ extraRoles: ['moderator'] }))
    const suspendedReviewer = await createTestUser({ extraRoles: ['moderator'] })
    await suspendTestUser(suspendedReviewer.id)
    const suspended = await requestFor(suspendedReviewer)
    const urls = [
      `${casePath(fixture.noticeId)}/escalations/${fixture.escalationId}/closures`,
      `${casePath(fixture.noticeId)}/supervised-complaints/${fixture.complaintId}/resolutions`,
      `${casePath(fixture.noticeId)}/preservation-holds`,
    ]
    for (const url of urls) {
      await createRequest().post(url).send({ kind: 'court_request' }).expect(401)
      await member.post(url).send({ kind: 'court_request' }).expect(403)
      await suspended.post(url).send({ kind: 'court_request' }).expect(403)
    }
    await moderator.post(urls[2]!).send({ kind: 'court_request' }).expect(201)
  })

  it('closes an escalation and resolves a supervised complaint with scoped, replay-safe writes', async () => {
    const first = await createRetentionReviewComplaintCase()
    const second = await createRetentionReviewComplaintCase()
    const reviewer = await requestFor(first.reviewer)
    const closureUrl = `${casePath(first.noticeId)}/escalations/${first.escalationId}/closures`
    const resolutionUrl = `${casePath(first.noticeId)}/supervised-complaints/${first.complaintId}/resolutions`

    await reviewer
      .post(`${casePath(second.noticeId)}/escalations/${first.escalationId}/closures`)
      .expect(404)
    await reviewer
      .post(`${casePath(second.noticeId)}/supervised-complaints/${first.complaintId}/resolutions`)
      .expect(404)
    expect(await readCopyrightRetentionReviewOutcomes(first.noticeId)).toEqual({
      closure_count: 0,
      resolution_count: 0,
    })

    const closure = await reviewer.post(closureUrl).expect(201)
    expect(closure.body.copyright_territorial_escalation_closure.closed_at).toEqual(
      expect.any(String),
    )
    const closureReplay = await reviewer.post(closureUrl).expect(201)
    expect(closureReplay.body).toEqual(closure.body)

    const resolution = await reviewer.post(resolutionUrl).expect(201)
    expect(resolution.body.copyright_eu_supervised_complaint_resolution.resolved_at).toEqual(
      expect.any(String),
    )
    const resolutionReplay = await reviewer.post(resolutionUrl).expect(201)
    expect(resolutionReplay.body).toEqual(resolution.body)
  })

  it.each(['litigation_threat', 'regulator_request', 'court_request'] as const)(
    'records and releases a %s case preservation hold',
    async kind => {
      const fixture = await createRetentionReviewComplaintCase()
      const reviewer = await requestFor(fixture.reviewer)
      const url = `${casePath(fixture.noticeId)}/preservation-holds`
      const created = await reviewer.post(url).send({ kind }).expect(201)
      const holdId = created.body.copyright_case_preservation_hold.id as string
      expect(holdId).toEqual(expect.any(String))
      const released = await reviewer.post(`${url}/${holdId}/releases`).expect(201)
      expect(released.body.copyright_case_preservation_hold_release.released_at).toEqual(
        expect.any(String),
      )
      await reviewer.post(`${url}/${holdId}/releases`).expect(409)
    },
  )

  it('records overlapping preservation holds after evidence erasure', async () => {
    const fixture = await createRetentionReviewComplaintCase()
    await markCopyrightReviewCaseExpired(fixture.noticeId)
    const reviewer = await requestFor(fixture.reviewer)
    const url = `${casePath(fixture.noticeId)}/preservation-holds`
    const first = await reviewer.post(url).send({ kind: 'litigation_threat' }).expect(201)
    const second = await reviewer.post(url).send({ kind: 'court_request' }).expect(201)
    expect(first.body.copyright_case_preservation_hold.id).not.toBe(
      second.body.copyright_case_preservation_hold.id,
    )
    await reviewer
      .post(`${url}/${first.body.copyright_case_preservation_hold.id}/releases`)
      .expect(201)
    await reviewer
      .post(`${url}/${second.body.copyright_case_preservation_hold.id}/releases`)
      .expect(201)
  })
})
