import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUserDirect } from '@voucha/test-helpers'
import { updateUserFields } from '@services/users'
import { getActorUri, getWebfingerAcct } from '@modules/activitypub-uris'
import { getSiteOrigin } from '@modules/utils'

const ourHostname = new URL(getSiteOrigin()).hostname

async function createFederatedUser() {
  const user = await createTestUserDirect()
  await updateUserFields(user.id, { fediverse_federation_enabled: true })
  return user
}

describe('GET /.well-known/webfinger', () => {
  it('returns 400 when resource is missing', async () => {
    const request = createRequest()
    await request.get('/.well-known/webfinger').expect(400)
  })

  it('returns 400 when resource is not an acct: URI', async () => {
    const request = createRequest()
    await request
      .get('/.well-known/webfinger')
      .query({ resource: `https://${ourHostname}/users/nobody` })
      .expect(400)
  })

  it('returns 404 when the hostname is not this app', async () => {
    const request = createRequest()
    await request
      .get('/.well-known/webfinger')
      .query({ resource: 'acct:someone@remote.example' })
      .expect(404)
  })

  it('returns 404 when the username does not resolve to a user', async () => {
    const request = createRequest()
    await request
      .get('/.well-known/webfinger')
      .query({ resource: `acct:no-such-user-${Date.now()}@${ourHostname}` })
      .expect(404)
  })

  it('returns 404 when the user has not opted into federation', async () => {
    const user = await createTestUserDirect()
    const request = createRequest()
    await request
      .get('/.well-known/webfinger')
      .query({ resource: `acct:${user.username}@${ourHostname}` })
      .expect(404)
  })

  it('resolves a federation-enabled user to their actor URI', async () => {
    const user = await createFederatedUser()
    const request = createRequest()
    const response = await request
      .get('/.well-known/webfinger')
      .query({ resource: `acct:${user.username}@${ourHostname}` })
      .expect(200)

    expect(response.headers['content-type']).toContain('application/jrd+json')
    expect(response.body).toEqual({
      subject: getWebfingerAcct(user.username!),
      aliases: [getActorUri(user.id)],
      links: [{ rel: 'self', type: 'application/activity+json', href: getActorUri(user.id) }],
    })
  })
})
