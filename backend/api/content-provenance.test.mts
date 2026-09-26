/**
 * REST session writes record the client that sent them, and a session write whose client is
 * unclassified is rejected instead of being recorded as an unknown channel.
 */
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  countTestPostsCreatedBy,
  createRandomString,
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
  readTestContentProvenance,
} from '@voucha/test-helpers'

async function signedInAs(clientHeaders: Record<string, string> = {}) {
  const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  const request = createRequest()
  request.setClientInfo(clientHeaders)
  await request.authenticateAs(user)
  return { user, request }
}

describe('content provenance on REST session writes', () => {
  it('records web on a post, a list and a community created by the web client', async () => {
    const { request } = await signedInAs()
    const random = createRandomString(8)

    const post = await request
      .post('/api/v1/posts')
      .send({ post_type: 'discussion', title: `Web ${random}`, markdown: 'Web post content' })
      .expect(201)
    const list = await request
      .post('/api/v1/lists')
      .send({ name: `Web list ${random}` })
      .expect(201)
    const community = await request
      .post('/api/v1/communities')
      .send({ name: `Web Provenance Community ${random}`, slug: `web-provenance-${random}` })
      .expect(201)

    const web = { createdVia: 'web', oauthClientId: null }
    await expect(readTestContentProvenance('posts', post.body.post.id)).resolves.toEqual(web)
    await expect(readTestContentProvenance('lists', list.body.list.id)).resolves.toEqual(web)
    await expect(
      readTestContentProvenance('communities', community.body.community.id),
    ).resolves.toEqual(web)
  })

  it('records the native client family that sent the request', async () => {
    const { request } = await signedInAs({ 'x-voucha-client': 'swift', 'x-voucha-platform': 'ios' })

    const post = await request
      .post('/api/v1/posts')
      .send({ post_type: 'discussion', title: 'Swift post', markdown: 'Swift post content' })
      .expect(201)

    await expect(readTestContentProvenance('posts', post.body.post.id)).resolves.toEqual({
      createdVia: 'swift',
      oauthClientId: null,
    })
  })

  it('rejects a write whose client information is invalid and creates nothing', async () => {
    const { user, request } = await signedInAs({ 'x-voucha-client': 'unclassified-client' })

    const response = await request
      .post('/api/v1/posts')
      .send({ post_type: 'discussion', title: 'Unclassified', markdown: 'Unclassified content' })
      .expect(400)

    expect(response.body.code).toBe('INVALID_CLIENT_INFO')
    await expect(countTestPostsCreatedBy(user.id)).resolves.toBe(0)
  })
})
