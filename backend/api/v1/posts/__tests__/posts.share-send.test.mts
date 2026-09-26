import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  countFollowerDistributionsForSenderForTest,
  createTestPost,
  createTestUser,
  followUser,
  suspendTestUser,
} from '@voucha/test-helpers'

describe('post follower distribution routes', () => {
  it('accepts a bodyless post share request', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const post = await createTestPost({ user: creator, privacy: 'public' })
    const request = createRequest()
    await request.authenticateAs(sender)

    const response = await request.post(`/api/v1/posts/${post.id}/shares`).expect(202)

    expect(response.body).toMatchObject({ status: 'accepted' })
    expect(response.body.distribution_id).toEqual(expect.any(String))
  })

  it('queues a selected follower post send distribution', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const follower = await createTestUser()
    await followUser(follower, sender)
    const post = await createTestPost({ user: creator, privacy: 'public' })
    const request = createRequest()
    await request.authenticateAs(sender)

    const response = await request
      .post(`/api/v1/posts/${post.id}/sends`)
      .send({ audience: 'selected_followers', recipient_user_ids: [follower.id] })
      .expect(202)

    expect(response.body).toMatchObject({ status: 'accepted' })
    expect(response.body.distribution_id).toEqual(expect.any(String))
  })

  it.each(['shares', 'sends'])('rejects suspended users from post %s', async action => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const post = await createTestPost({ user: creator, privacy: 'public' })
    const request = createRequest()
    await request.authenticateAs(sender)
    await suspendTestUser(sender.id)
    const before = await countFollowerDistributionsForSenderForTest(sender.id)

    const pending = request.post(`/api/v1/posts/${post.id}/${action}`)
    if (action === 'sends') pending.send({ audience: 'all_followers' })
    await pending.expect(403)

    await expect(countFollowerDistributionsForSenderForTest(sender.id)).resolves.toBe(before)
  })

  it('rejects invalid selected follower payloads before distribution creation', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const post = await createTestPost({ user: creator, privacy: 'public' })
    const request = createRequest()
    await request.authenticateAs(sender)
    const before = await countFollowerDistributionsForSenderForTest(sender.id)

    await request
      .post(`/api/v1/posts/${post.id}/sends`)
      .send({ audience: 'selected_followers', recipient_user_ids: [] })
      .expect(422)

    await expect(countFollowerDistributionsForSenderForTest(sender.id)).resolves.toBe(before)
  })

  it('applies post target policy before malformed send body diagnostics', async () => {
    const sender = await createTestUser()
    const post = await createTestPost({ user: sender, privacy: 'public' })
    const request = createRequest()
    await request.authenticateAs(sender)
    const before = await countFollowerDistributionsForSenderForTest(sender.id)

    await request
      .post(`/api/v1/posts/${post.id}/sends`)
      .send({ audience: 'selected_followers', recipient_user_ids: [] })
      .expect(400)

    await expect(countFollowerDistributionsForSenderForTest(sender.id)).resolves.toBe(before)
  })

  it('rejects extra send fields before distribution creation', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const post = await createTestPost({ user: creator, privacy: 'public' })
    const request = createRequest()
    await request.authenticateAs(sender)
    const before = await countFollowerDistributionsForSenderForTest(sender.id)

    await request
      .post(`/api/v1/posts/${post.id}/sends`)
      .send({ audience: 'all_followers', unexpected: true })
      .expect(422)

    await expect(countFollowerDistributionsForSenderForTest(sender.id)).resolves.toBe(before)
  })
})
