import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUserDirect } from '@voucha/test-helpers'
import { updateUserFields, getUserDisplayName } from '@services/users'
import {
  getActorKeyId,
  getActorFollowersUri,
  getActorFollowingUri,
  getActorOutboxUri,
  getActorUri,
  getSharedInboxUri,
} from '@modules/activitypub-uris'

async function createFederatedUser() {
  const user = await createTestUserDirect()
  await updateUserFields(user.id, { fediverse_federation_enabled: true })
  return user
}

describe('GET /ap/users/:userId', () => {
  it('returns 422 for a non-UUID userId', async () => {
    const request = createRequest()
    await request.get('/ap/users/not-a-uuid').expect(422)
  })

  it('returns 404 for an unknown userId', async () => {
    const request = createRequest()
    await request.get('/ap/users/019514e0-0000-7000-8000-000000000000').expect(404)
  })

  it('returns 404 when the user has not opted into federation', async () => {
    const user = await createTestUserDirect()
    const request = createRequest()
    await request.get(`/ap/users/${user.id}`).expect(404)
  })

  it('returns a Person actor document for a federation-enabled user', async () => {
    const user = await createFederatedUser()
    const request = createRequest()
    const response = await request.get(`/ap/users/${user.id}`).expect(200)

    expect(response.headers['content-type']).toContain('application/activity+json')
    expect(response.body).toMatchObject({
      id: getActorUri(user.id),
      type: 'Person',
      name: getUserDisplayName(user),
      inbox: getSharedInboxUri(),
      outbox: getActorOutboxUri(user.id),
      followers: getActorFollowersUri(user.id),
      following: getActorFollowingUri(user.id),
      endpoints: { sharedInbox: getSharedInboxUri() },
      publicKey: {
        id: getActorKeyId(user.id),
        owner: getActorUri(user.id),
      },
    })
    expect(response.body.publicKey.publicKeyPem).toContain('BEGIN PUBLIC KEY')
    expect(response.body.preferredUsername).toBeUndefined()
  })

  it('reuses the same keypair across repeated fetches', async () => {
    const user = await createFederatedUser()
    const request = createRequest()
    const first = await request.get(`/ap/users/${user.id}`).expect(200)
    const second = await request.get(`/ap/users/${user.id}`).expect(200)

    expect(second.body.publicKey.publicKeyPem).toBe(first.body.publicKey.publicKeyPem)
  })
})
