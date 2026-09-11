import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  createTestUserWithAge,
  insertTestLocalFollow,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'
import { upsertUserVouchElectionVotes } from '@services/elections-votes/user-vouch'
import { onceElectionVoteStatsCompleted } from '@workers/elections/test-support'

describe('User vouch-context route', () => {
  it('GET /api/v1/users/:id/vouch-context returns 401 for anonymous viewers', async () => {
    const target = await createTestUser()
    await createRequest().get(`/api/v1/users/${target.id}/vouch-context`).expect(401)
  }, 60_000)

  it('GET /api/v1/users/:id/vouch-context returns vouchers and disavowers among followed users', async () => {
    const viewer = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const target = await createTestUser()
    const voucher = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const liker = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const disliker = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const disavower = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const stranger = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)

    await insertTestLocalFollow(viewer.id, voucher.id)
    await insertTestLocalFollow(viewer.id, liker.id)
    await insertTestLocalFollow(viewer.id, disliker.id)
    await insertTestLocalFollow(viewer.id, disavower.id)
    // viewer does NOT follow stranger

    await upsertUserVouchElectionVotes(voucher.id, [{ entityId: target.id, score: 2 }])
    await upsertUserVouchElectionVotes(liker.id, [{ entityId: target.id, score: 1 }])
    await upsertUserVouchElectionVotes(disliker.id, [{ entityId: target.id, score: -1 }])
    await upsertUserVouchElectionVotes(disavower.id, [{ entityId: target.id, score: -2 }])
    await upsertUserVouchElectionVotes(stranger.id, [{ entityId: target.id, score: 1 }])
    await upsertUserVouchElectionVotes(viewer.id, [{ entityId: target.id, score: 1 }])

    await onceElectionVoteStatsCompleted(target.id)

    const request = createRequest()
    await request.authenticateAs(viewer)
    const response = await request.get(`/api/v1/users/${target.id}/vouch-context`).expect(200)

    expect(response.body.positive_by_following.total).toBe(2)
    expect(response.body.positive_by_following.users.map((u: { id: string }) => u.id)).toContain(
      voucher.id,
    )
    expect(
      response.body.positive_by_following.users.map((u: { id: string }) => u.id),
    ).not.toContain(stranger.id)
    expect(response.body.positive_by_following.users.map((u: { id: string }) => u.id)).toContain(
      liker.id,
    )

    expect(response.body.negative_by_following.total).toBe(2)
    expect(response.body.negative_by_following.users.map((u: { id: string }) => u.id)).toContain(
      disavower.id,
    )
    expect(response.body.negative_by_following.users.map((u: { id: string }) => u.id)).toContain(
      disliker.id,
    )
    expect(response.body.election_vote.choice).toBe('like')
  }, 60_000)

  it('GET /api/v1/users/:id/vouch-context returns empty totals for self-target', async () => {
    const viewer = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const request = createRequest()
    await request.authenticateAs(viewer)

    const response = await request.get(`/api/v1/users/${viewer.id}/vouch-context`).expect(200)
    expect(response.body.positive_by_following.total).toBe(0)
    expect(response.body.negative_by_following.total).toBe(0)
    expect(response.body.election_vote).toBeNull()
  }, 60_000)

  it('GET /api/v1/users/:id/vouch-context buckets each voter by their most recent vote', async () => {
    const viewer = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const target = await createTestUser()
    const flipper = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)

    await insertTestLocalFollow(viewer.id, flipper.id)

    // Voter initially vouches (+2) then disavows (-2). Vote tables are append-only,
    // so both rows persist; only the latest should determine the bucket.
    await upsertUserVouchElectionVotes(flipper.id, [{ entityId: target.id, score: 2 }])
    await upsertUserVouchElectionVotes(flipper.id, [{ entityId: target.id, score: -2 }])
    await onceElectionVoteStatsCompleted(target.id)

    const request = createRequest()
    await request.authenticateAs(viewer)
    const response = await request.get(`/api/v1/users/${target.id}/vouch-context`).expect(200)

    expect(response.body.positive_by_following.total).toBe(0)
    expect(
      response.body.positive_by_following.users.map((u: { id: string }) => u.id),
    ).not.toContain(flipper.id)
    expect(response.body.negative_by_following.total).toBe(1)
    expect(response.body.negative_by_following.users.map((u: { id: string }) => u.id)).toContain(
      flipper.id,
    )
  }, 60_000)

  it('GET /api/v1/users/:id/vouch-context excludes voters whose likes_visibility hides them', async () => {
    const viewer = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const target = await createTestUser()
    const hiddenVoucher = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)

    await insertTestLocalFollow(viewer.id, hiddenVoucher.id)
    await upsertUserVouchElectionVotes(hiddenVoucher.id, [{ entityId: target.id, score: 1 }])
    await onceElectionVoteStatsCompleted(target.id)

    // Update voter's likes_visibility to 'nobody'
    const voterRequest = createRequest()
    await voterRequest.authenticateAs(hiddenVoucher)
    await voterRequest
      .patch(`/api/v1/users/${hiddenVoucher.id}`)
      .send({ likes_visibility: 'nobody' })
      .expect(200)

    const request = createRequest()
    await request.authenticateAs(viewer)
    const response = await request.get(`/api/v1/users/${target.id}/vouch-context`).expect(200)

    expect(response.body.positive_by_following.total).toBe(0)
  }, 60_000)
})
