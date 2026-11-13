import {
  assertCopyrightApiRetentionClosure,
  assertCopyrightApiPreservationRelease,
} from '@voucha/test-helpers/copyright-api-retention-rc-outcomes'
import {
  createCopyrightApiRetentionCase,
  seedCopyrightApiPreservationHold,
} from '@voucha/test-helpers/copyright-api-retention-fixtures'
import {
  assertCopyrightApiPreservationPlacement,
  readCopyrightApiRetentionState,
} from '@voucha/test-helpers/copyright-api-preservation-outcome'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, suspendTestUser } from '@voucha/test-helpers/entities/users'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
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
    const fixture = await createCopyrightApiRetentionCase()
    const member = await requestFor(await createTestUser())
    const moderatorUser = await createTestUser({ extraRoles: ['moderator'] })
    const moderator = await requestFor(moderatorUser)
    const suspendedReviewer = await createTestUser({ extraRoles: ['moderator'] })
    await suspendTestUser(suspendedReviewer.id)
    const suspended = await requestFor(suspendedReviewer)
    const urls = [
      `${casePath(fixture.noticeId)}/escalations/${fixture.escalationId}/closures`,
      `${casePath(fixture.noticeId)}/supervised-complaints/${fixture.complaintId}/resolutions`,
      `${casePath(fixture.noticeId)}/preservation-holds`,
    ]
    const before = await readCopyrightApiRetentionState(fixture.noticeId)
    for (const url of urls) {
      await createRequest().post(url).send({ kind: 'court_request' }).expect(401)
      await member.post(url).send({ kind: 'court_request' }).expect(403)
      await suspended.post(url).send({ kind: 'court_request' }).expect(403)
    }
    expect(await readCopyrightApiRetentionState(fixture.noticeId)).toEqual(before)
    await assertCopyrightApiPreservationPlacement({
      staff: moderator,
      noticeId: fixture.noticeId,
      reviewerId: moderatorUser.id,
      kind: 'court_request',
    })
  })

  it('closes an escalation and resolves a supervised complaint with scoped, replay-safe writes', async () => {
    const first = await createCopyrightApiRetentionCase()
    const second = await createCopyrightApiRetentionCase()
    const reviewer = await requestFor(first.reviewer)

    const beforeFirst = await readCopyrightApiRetentionState(first.noticeId)
    const beforeSecond = await readCopyrightApiRetentionState(second.noticeId)
    await reviewer
      .post(`${casePath(second.noticeId)}/escalations/${first.escalationId}/closures`)
      .expect(404)
    await reviewer
      .post(`${casePath(second.noticeId)}/supervised-complaints/${first.complaintId}/resolutions`)
      .expect(404)
    expect(await readCopyrightApiRetentionState(first.noticeId)).toEqual(beforeFirst)
    expect(await readCopyrightApiRetentionState(second.noticeId)).toEqual(beforeSecond)
    expect(await readCopyrightRetentionReviewOutcomes(first.noticeId)).toEqual({
      closure_count: 0,
      resolution_count: 0,
    })

    await assertCopyrightApiRetentionClosure({
      staff: reviewer,
      noticeId: first.noticeId,
      childId: first.escalationId,
      reviewerId: first.reviewer.id,
      kind: 'escalation',
    })
    await assertCopyrightApiRetentionClosure({
      staff: reviewer,
      noticeId: first.noticeId,
      childId: first.complaintId,
      reviewerId: first.reviewer.id,
      kind: 'complaint',
    })
  })

  it.each(['litigation_threat', 'regulator_request', 'court_request'] as const)(
    'records and releases a %s case preservation hold',
    async kind => {
      const fixture = await createCopyrightApiRetentionCase()
      const reviewer = await requestFor(fixture.reviewer)
      await assertCopyrightApiPreservationPlacement({
        staff: reviewer,
        noticeId: fixture.noticeId,
        reviewerId: fixture.reviewer.id,
        kind,
      })
      // Release and duplicate-release checks always use a separately committed hold.
      const committed = await createCopyrightApiRetentionCase()
      const committedReviewer = await requestFor(committed.reviewer)
      const holdId = await seedCopyrightApiPreservationHold(
        committed.noticeId,
        committed.reviewer.id,
        kind,
      )
      expect(holdId).toEqual(expect.any(String))
      await assertCopyrightApiPreservationRelease({
        staff: committedReviewer,
        noticeId: committed.noticeId,
        holdId,
        reviewerId: committed.reviewer.id,
      })
    },
  )

  it('records overlapping preservation holds after evidence erasure', async () => {
    const fixture = await createCopyrightApiRetentionCase()
    await markCopyrightReviewCaseExpired(fixture.noticeId)
    const reviewer = await requestFor(fixture.reviewer)
    await assertCopyrightApiPreservationPlacement({
      staff: reviewer,
      noticeId: fixture.noticeId,
      reviewerId: fixture.reviewer.id,
      kind: 'litigation_threat',
    })
    await assertCopyrightApiPreservationPlacement({
      staff: reviewer,
      noticeId: fixture.noticeId,
      reviewerId: fixture.reviewer.id,
      kind: 'court_request',
    })
    const committed = await createCopyrightApiRetentionCase()
    await markCopyrightReviewCaseExpired(committed.noticeId)
    const committedReviewer = await requestFor(committed.reviewer)
    const first = await seedCopyrightApiPreservationHold(
      committed.noticeId,
      committed.reviewer.id,
      'litigation_threat',
    )
    const second = await seedCopyrightApiPreservationHold(
      committed.noticeId,
      committed.reviewer.id,
      'court_request',
    )
    expect(first).not.toBe(second)
    for (const holdId of [first, second]) {
      await assertCopyrightApiPreservationRelease({
        staff: committedReviewer,
        noticeId: committed.noticeId,
        holdId,
        reviewerId: committed.reviewer.id,
      })
    }
  })
})
