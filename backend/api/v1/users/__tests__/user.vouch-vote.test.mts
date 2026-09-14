import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestUserWithAge,
  getEntityRelation,
  getFollowExists,
  insertTestLocalFollow,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'
import { getUserVouchElectionById } from '@services/elections-votes/user-vouch'
import { onceElectionVoteStatsCompleted } from '@workers/elections/test-support'

describe('User vouch vote routes', () => {
  it('PUT /api/v1/users/:id/vouch-vote returns 401 for anonymous viewers', async () => {
    const target = await createTestUser()
    await createRequest()
      .put(`/api/v1/users/${target.id}/vouch-vote`)
      .send({ choice: 'like' })
      .expect(401)
  }, 60_000)

  it('PUT /api/v1/users/:id/vouch-vote rejects self-votes with 403', async () => {
    const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const request = createRequest()
    await request.authenticateAs(voter)

    await request
      .put(`/api/v1/users/${voter.id}/vouch-vote`)
      .send({ choice: 'disavow' })
      .expect(403)
  }, 60_000)

  it('PUT /api/v1/users/:id/vouch-vote (like) does not mute or unfollow', async () => {
    const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const target = await createTestUser()
    await insertTestLocalFollow(voter.id, target.id)
    const request = createRequest()
    await request.authenticateAs(voter)

    await request.put(`/api/v1/users/${target.id}/vouch-vote`).send({ choice: 'like' }).expect(204)
    await onceElectionVoteStatsCompleted(target.id)
    const election = await getUserVouchElectionById(target.id)
    expect(election?.votes_count_up).toBe(1)
    expect(election?.votes_count_down).toBe(0)

    expect(await getFollowExists(voter.id, target.id)).toBe(true)
    const muteRelations = await getEntityRelation('relation__user__mute__user', voter.id, target.id)
    expect(muteRelations).toHaveLength(0)
  }, 60_000)

  it('PUT /api/v1/users/:id/vouch-vote (dislike) does not mute or unfollow', async () => {
    const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const target = await createTestUser()
    await insertTestLocalFollow(voter.id, target.id)
    const request = createRequest()
    await request.authenticateAs(voter)

    await request
      .put(`/api/v1/users/${target.id}/vouch-vote`)
      .send({ choice: 'dislike' })
      .expect(204)
    await onceElectionVoteStatsCompleted(target.id)
    const election = await getUserVouchElectionById(target.id)
    expect(election?.votes_count_up).toBe(0)
    expect(election?.votes_count_down).toBe(1)

    expect(await getFollowExists(voter.id, target.id)).toBe(true)
    const muteRelations = await getEntityRelation('relation__user__mute__user', voter.id, target.id)
    expect(muteRelations).toHaveLength(0)
  }, 60_000)

  it('PUT /api/v1/users/:id/vouch-vote (disavow) records the vote, auto-mutes, and soft-deletes the follow', async () => {
    const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const target = await createTestUser()
    await insertTestLocalFollow(voter.id, target.id)
    expect(await getFollowExists(voter.id, target.id)).toBe(true)

    const request = createRequest()
    await request.authenticateAs(voter)

    await request
      .put(`/api/v1/users/${target.id}/vouch-vote`)
      .send({ choice: 'disavow' })
      .expect(204)

    await onceElectionVoteStatsCompleted(target.id)
    const election = await getUserVouchElectionById(target.id)
    expect(election?.votes_count_up).toBe(0)
    expect(election?.votes_count_down).toBe(1)

    const muteRelations = await getEntityRelation('relation__user__mute__user', voter.id, target.id)
    expect(muteRelations).toHaveLength(1)

    expect(await getFollowExists(voter.id, target.id)).toBe(false)
  }, 60_000)

  it('Neutral retract does not unmute or restore the follow', async () => {
    const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const target = await createTestUser()
    await insertTestLocalFollow(voter.id, target.id)

    const request = createRequest()
    await request.authenticateAs(voter)

    await request
      .put(`/api/v1/users/${target.id}/vouch-vote`)
      .send({ choice: 'disavow' })
      .expect(204)
    await onceElectionVoteStatsCompleted(target.id)
    const disavowedElection = await getUserVouchElectionById(target.id)
    expect(disavowedElection?.votes_count_up).toBe(0)
    expect(disavowedElection?.votes_count_down).toBe(1)
    expect(await getFollowExists(voter.id, target.id)).toBe(false)

    await request
      .put(`/api/v1/users/${target.id}/vouch-vote`)
      .send({ choice: 'neutral' })
      .expect(204)
    await onceElectionVoteStatsCompleted(target.id)
    const neutralElection = await getUserVouchElectionById(target.id)
    expect(neutralElection?.votes_count_up).toBe(0)
    expect(neutralElection?.votes_count_down).toBe(0)

    expect(await getFollowExists(voter.id, target.id)).toBe(false)
    const muteRelations = await getEntityRelation('relation__user__mute__user', voter.id, target.id)
    expect(muteRelations).toHaveLength(1)
  }, 60_000)
})
