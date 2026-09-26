import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import {
  revokeTestOAuthClient,
  setTestOAuthClientMetadataUrl,
} from '@voucha/test-helpers/entities/oauth-client-management'
import {
  createOwnedOAuthApp,
  registerOAuthClient,
  updateOwnedOAuthApp,
  verifyOAuthClient,
  type OAuthAppView,
} from '@services/oauth-authorization-server'
import { randomTestOAuthRedirectUri } from '@services/oauth-authorization-server/test-support'
import type { PrivateUser } from '@services/users/types'

const MISSING_ID = '00000000-0000-7000-8000-000000000000'

type ListedClient = {
  id: string
  client_id: string
  client_name: string
  redirect_uris: string[]
  owner: { id: string; username: string } | null
}

async function createApp(ownerId: string) {
  const { oauth_app: app } = await createOwnedOAuthApp(ownerId, {
    client_name: `Staff review ${randomBytes(6).toString('hex')}`,
    redirect_uris: [randomTestOAuthRedirectUri()],
    scopes: ['mcp.user:read'],
  })
  return app
}

function reviewOf(app: OAuthAppView) {
  return { client_name: app.client_name, redirect_uris: app.redirect_uris }
}

describe('GET /api/v1/admin/oauth-clients', () => {
  let admin: PrivateUser
  let moderator: PrivateUser
  let owner: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    moderator = await createTestUser({ extraRoles: ['moderator'] })
    owner = await createTestUser()
  })

  it('returns 401 when not authenticated and 403 for a non-administrator', async () => {
    await createRequest().get('/api/v1/admin/oauth-clients').expect(401)
    const request = createRequest()
    await request.authenticateAs(moderator)
    await request.get('/api/v1/admin/oauth-clients').expect(403)
  })

  it('filters by verification and projects the owner', async () => {
    const unverified = await createApp(owner.id)
    const verified = await createApp(owner.id)
    await verifyOAuthClient(admin.id, verified.id, reviewOf(verified))
    const request = createRequest()
    await request.authenticateAs(admin)

    const pending = await request
      .get('/api/v1/admin/oauth-clients')
      .query({ verification: 'unverified', limit: 100 })
      .expect(200)
    const pendingIds = pending.body.results.map((client: ListedClient) => client.id)
    expect(pendingIds).toContain(unverified.id)
    expect(pendingIds).not.toContain(verified.id)
    const listed = pending.body.results.find(
      (client: ListedClient) => client.id === unverified.id,
    ) as ListedClient
    expect(listed.owner).toMatchObject({ id: owner.id, username: owner.username })

    const done = await request
      .get('/api/v1/admin/oauth-clients')
      .query({ verification: 'verified', limit: 100 })
      .expect(200)
    expect(done.body.results.map((client: ListedClient) => client.id)).toContain(verified.id)
  })

  it('lists a self-registered client without an owner', async () => {
    const registered = await registerOAuthClient({
      client_name: `Dynamic client ${randomBytes(6).toString('hex')}`,
      redirect_uris: [randomTestOAuthRedirectUri()],
      token_endpoint_auth_method: 'none',
      scope: 'mcp.user:read',
    })
    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request
      .get('/api/v1/admin/oauth-clients')
      .query({ verification: 'unverified', limit: 100 })
      .expect(200)
    const listed = response.body.results.find(
      (client: ListedClient) => client.client_id === registered.client_id,
    ) as ListedClient
    expect(listed.owner).toBeNull()
  })

  it('pages with a cursor scoped to the filter', async () => {
    await createApp(owner.id)
    await createApp(owner.id)
    const request = createRequest()
    await request.authenticateAs(admin)
    const page = await request.get('/api/v1/admin/oauth-clients?limit=1').expect(200)
    expect(page.body.page_info).toMatchObject({ has_next_page: true })

    const next = await request
      .get('/api/v1/admin/oauth-clients')
      .query({ limit: 1, after: page.body.page_info.end_cursor })
      .expect(200)
    expect(next.body.results[0].id.localeCompare(page.body.results[0].id)).toBeLessThan(0)
    await request
      .get('/api/v1/admin/oauth-clients')
      .query({ verification: 'verified', after: page.body.page_info.end_cursor })
      .expect(400)
  })

  it('returns 422 for an unknown verification filter', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.get('/api/v1/admin/oauth-clients?verification=pending').expect(422)
  })
})

describe('PUT and DELETE /api/v1/admin/oauth-clients/:id/verification', () => {
  let admin: PrivateUser
  let moderator: PrivateUser
  let owner: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    moderator = await createTestUser({ extraRoles: ['moderator'] })
    owner = await createTestUser()
  })

  it('verifies the reviewed name and destinations and clears it again', async () => {
    const app = await createApp(owner.id)
    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request
      .put(`/api/v1/admin/oauth-clients/${app.id}/verification`)
      .send(reviewOf(app))
      .expect(200)
    expect(response.body.oauth_client).toMatchObject({ id: app.id, verified_by_id: admin.id })
    expect(response.body.oauth_client.verified_at).toEqual(expect.any(String))

    await request.delete(`/api/v1/admin/oauth-clients/${app.id}/verification`).expect(204)
    const cleared = await request
      .get('/api/v1/admin/oauth-clients')
      .query({ verification: 'unverified', limit: 100 })
      .expect(200)
    expect(cleared.body.results.map((client: ListedClient) => client.id)).toContain(app.id)
  })

  it('returns 409 when the owner re-points the app after review', async () => {
    const app = await createApp(owner.id)
    const request = createRequest()
    await request.authenticateAs(admin)
    const listed = await request
      .get('/api/v1/admin/oauth-clients')
      .query({ verification: 'unverified', limit: 100 })
      .expect(200)
    const reviewed = listed.body.results.find(
      (client: ListedClient) => client.id === app.id,
    ) as ListedClient
    await updateOwnedOAuthApp(owner.id, app.id, { redirect_uris: [randomTestOAuthRedirectUri()] })

    await request
      .put(`/api/v1/admin/oauth-clients/${app.id}/verification`)
      .send({ client_name: reviewed.client_name, redirect_uris: reviewed.redirect_uris })
      .expect(409)
    const pending = await request
      .get('/api/v1/admin/oauth-clients')
      .query({ verification: 'unverified', limit: 100 })
      .expect(200)
    expect(pending.body.results.map((client: ListedClient) => client.id)).toContain(app.id)
  })

  it('returns 409 for a stale name or an ineligible client and 404 when missing', async () => {
    const app = await createApp(owner.id)
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .put(`/api/v1/admin/oauth-clients/${app.id}/verification`)
      .send({ ...reviewOf(app), client_name: 'Not the reviewed name' })
      .expect(409)

    const described = await createApp(owner.id)
    await setTestOAuthClientMetadataUrl(
      described.id,
      `https://example.com/${randomBytes(6).toString('hex')}/client.json`,
    )
    await request
      .put(`/api/v1/admin/oauth-clients/${described.id}/verification`)
      .send(reviewOf(described))
      .expect(409)

    const revoked = await createApp(owner.id)
    await revokeTestOAuthClient(revoked.id)
    await request
      .put(`/api/v1/admin/oauth-clients/${revoked.id}/verification`)
      .send(reviewOf(revoked))
      .expect(409)

    await request
      .put(`/api/v1/admin/oauth-clients/${MISSING_ID}/verification`)
      .send(reviewOf(app))
      .expect(404)
    await request.delete(`/api/v1/admin/oauth-clients/${MISSING_ID}/verification`).expect(404)
  })

  it('refuses a moderator', async () => {
    const app = await createApp(owner.id)
    const request = createRequest()
    await request.authenticateAs(moderator)
    await request
      .put(`/api/v1/admin/oauth-clients/${app.id}/verification`)
      .send(reviewOf(app))
      .expect(403)
    await request.delete(`/api/v1/admin/oauth-clients/${app.id}/verification`).expect(403)
  })
})
