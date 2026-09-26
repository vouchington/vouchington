import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { clientSecretMatchesStoredHash } from '@voucha/test-helpers/entities/oauth-authorization-server'
import { setTestOAuthClientVerified } from '@voucha/test-helpers/entities/oauth-client-management'
import { createOwnedOAuthApp } from '@services/oauth-authorization-server'
import { randomTestOAuthRedirectUri } from '@services/oauth-authorization-server/test-support'
import type { PrivateUser } from '@services/users/types'

const MISSING_ID = '00000000-0000-7000-8000-000000000000'

function appBody(overrides: Record<string, unknown> = {}) {
  return {
    client_name: `Route app ${randomBytes(6).toString('hex')}`,
    redirect_uris: [randomTestOAuthRedirectUri()],
    scopes: ['mcp.user:read'],
    ...overrides,
  }
}

describe('GET /api/v1/my/oauth-apps', () => {
  let owner: PrivateUser
  let stranger: PrivateUser

  beforeAll(async () => {
    owner = await createTestUser()
    stranger = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    await createRequest().get('/api/v1/my/oauth-apps').expect(401)
  })

  it('pages only the current user’s apps newest first', async () => {
    const first = await createOwnedOAuthApp(owner.id, appBody())
    const second = await createOwnedOAuthApp(owner.id, appBody())
    await createOwnedOAuthApp(stranger.id, appBody())
    const request = createRequest()
    await request.authenticateAs(owner)

    const page = await request.get('/api/v1/my/oauth-apps?limit=1').expect(200)
    expect(page.body.results.map((app: { id: string }) => app.id)).toEqual([second.oauth_app.id])
    expect(page.body.page_info).toMatchObject({ has_next_page: true })
    expect(page.body.results[0]).not.toHaveProperty('client_secret')

    const next = await request
      .get('/api/v1/my/oauth-apps')
      .query({ limit: 1, after: page.body.page_info.end_cursor })
      .expect(200)
    expect(next.body.results.map((app: { id: string }) => app.id)).toEqual([first.oauth_app.id])
    expect(next.body.page_info).toMatchObject({ has_next_page: false })
  })

  it('rejects a cursor minted for another user', async () => {
    await createOwnedOAuthApp(stranger.id, appBody())
    await createOwnedOAuthApp(stranger.id, appBody())
    const strangerRequest = createRequest()
    await strangerRequest.authenticateAs(stranger)
    const page = await strangerRequest.get('/api/v1/my/oauth-apps?limit=1').expect(200)

    const request = createRequest()
    await request.authenticateAs(owner)
    await request
      .get('/api/v1/my/oauth-apps')
      .query({ after: page.body.page_info.end_cursor })
      .expect(400)
  })
})

describe('POST /api/v1/my/oauth-apps', () => {
  let owner: PrivateUser

  beforeAll(async () => {
    owner = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    await createRequest().post('/api/v1/my/oauth-apps').send(appBody()).expect(401)
  })

  it('registers a confidential app and returns its secret once', async () => {
    const request = createRequest()
    await request.authenticateAs(owner)
    const response = await request
      .post('/api/v1/my/oauth-apps')
      .send(appBody({ token_endpoint_auth_method: 'client_secret_basic' }))
      .expect(201)

    expect(response.body.oauth_app).toMatchObject({
      client_type: 'confidential',
      scopes: ['mcp.user:read'],
      verified_at: null,
    })
    await expect(
      clientSecretMatchesStoredHash(response.body.oauth_app.client_id, response.body.client_secret),
    ).resolves.toBe(true)
  })

  it('returns 422 when registration policy rejects the metadata', async () => {
    const request = createRequest()
    await request.authenticateAs(owner)
    const response = await request
      .post('/api/v1/my/oauth-apps')
      .send(appBody({ redirect_uris: ['http://example.com/callback'] }))
      .expect(422)
    expect(response.body.message).toMatch(/redirect/i)
    await request
      .post('/api/v1/my/oauth-apps')
      .send(appBody({ scopes: ['mcp.user:unknown'] }))
      .expect(422)
  })
})

describe('PATCH and DELETE /api/v1/my/oauth-apps/:id', () => {
  let owner: PrivateUser
  let stranger: PrivateUser

  beforeAll(async () => {
    owner = await createTestUser()
    stranger = await createTestUser()
  })

  it('renames an app and clears its verification', async () => {
    const { oauth_app: app } = await createOwnedOAuthApp(owner.id, appBody())
    await setTestOAuthClientVerified(app.id, stranger.id)
    const request = createRequest()
    await request.authenticateAs(owner)

    const response = await request
      .patch(`/api/v1/my/oauth-apps/${app.id}`)
      .send({ client_name: 'Renamed route app' })
      .expect(200)
    expect(response.body.oauth_app).toMatchObject({
      id: app.id,
      client_name: 'Renamed route app',
      verified_at: null,
    })
  })

  it('returns 422 for an update the service rejects and 404 for a foreign app', async () => {
    const { oauth_app: app } = await createOwnedOAuthApp(owner.id, appBody())
    const request = createRequest()
    await request.authenticateAs(owner)
    await request.patch(`/api/v1/my/oauth-apps/${app.id}`).send({}).expect(422)

    const strangerRequest = createRequest()
    await strangerRequest.authenticateAs(stranger)
    await strangerRequest
      .patch(`/api/v1/my/oauth-apps/${app.id}`)
      .send({ client_name: 'Taken over' })
      .expect(404)
    await strangerRequest.delete(`/api/v1/my/oauth-apps/${app.id}`).expect(404)
  })

  it('revokes an app once', async () => {
    const { oauth_app: app } = await createOwnedOAuthApp(owner.id, appBody())
    const request = createRequest()
    await request.authenticateAs(owner)
    await request.delete(`/api/v1/my/oauth-apps/${app.id}`).expect(204)
    await request.delete(`/api/v1/my/oauth-apps/${app.id}`).expect(404)
  })
})

describe('POST /api/v1/my/oauth-apps/:id/client-secrets', () => {
  let owner: PrivateUser

  beforeAll(async () => {
    owner = await createTestUser()
  })

  it('rotates a confidential app’s secret', async () => {
    const issued = await createOwnedOAuthApp(
      owner.id,
      appBody({ token_endpoint_auth_method: 'client_secret_basic' }),
    )
    const request = createRequest()
    await request.authenticateAs(owner)
    const response = await request
      .post(`/api/v1/my/oauth-apps/${issued.oauth_app.id}/client-secrets`)
      .expect(201)

    expect(response.body.oauth_app.id).toBe(issued.oauth_app.id)
    expect(response.body.client_secret).not.toBe(issued.client_secret)
    await expect(
      clientSecretMatchesStoredHash(issued.oauth_app.client_id, response.body.client_secret),
    ).resolves.toBe(true)
  })

  it('returns 409 for a public app and 404 for a missing one', async () => {
    const { oauth_app: app } = await createOwnedOAuthApp(owner.id, appBody())
    const request = createRequest()
    await request.authenticateAs(owner)
    await request.post(`/api/v1/my/oauth-apps/${app.id}/client-secrets`).expect(409)
    await request.post(`/api/v1/my/oauth-apps/${MISSING_ID}/client-secrets`).expect(404)
  })
})
