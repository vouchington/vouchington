import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import { exchangeOAuthAuthorizationCode } from '@services/oauth-authorization-server'
import {
  createTestApprovedOAuthAuthorization,
  TEST_OAUTH_RESOURCE,
} from '@services/oauth-authorization-server/test-support'
import type { PrivateUser } from '@services/users/types'

const MISSING_ID = '00000000-0000-7000-8000-000000000000'

async function authorize(user: PrivateUser) {
  const flow = await createTestApprovedOAuthAuthorization(user)
  await exchangeOAuthAuthorizationCode({
    clientId: flow.client.client_id,
    code: flow.code,
    codeVerifier: flow.verifier,
    redirectUri: flow.redirectUri,
  })
  return flow
}

type ListedGrant = { id: string; client: { client_id: string } }

describe('GET /api/v1/my/oauth-grants', () => {
  let user: PrivateUser
  let stranger: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    stranger = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    await createRequest().get('/api/v1/my/oauth-grants').expect(401)
  })

  it('pages the current user’s authorized apps', async () => {
    const first = await authorize(user)
    const second = await authorize(user)
    await authorize(stranger)
    const request = createRequest()
    await request.authenticateAs(user)

    const page = await request.get('/api/v1/my/oauth-grants?limit=1').expect(200)
    expect(page.body.results).toHaveLength(1)
    expect(page.body.results[0]).toMatchObject({
      client: { client_id: second.client.client_id, verified: false },
      resource: TEST_OAUTH_RESOURCE,
      scopes: ['mcp.user:read', 'mcp.user:write'],
    })
    expect(page.body.page_info).toMatchObject({ has_next_page: true })

    const next = await request
      .get('/api/v1/my/oauth-grants')
      .query({ limit: 1, after: page.body.page_info.end_cursor })
      .expect(200)
    expect(next.body.results.map((grant: ListedGrant) => grant.client.client_id)).toEqual([
      first.client.client_id,
    ])
    expect(next.body.page_info).toMatchObject({ has_next_page: false })
  })
})

describe('DELETE /api/v1/my/oauth-grants/:id', () => {
  let user: PrivateUser
  let stranger: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    stranger = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    await createRequest().delete(`/api/v1/my/oauth-grants/${MISSING_ID}`).expect(401)
  })

  it('revokes the user’s grant once and hides it from the list', async () => {
    const flow = await authorize(user)
    const request = createRequest()
    await request.authenticateAs(user)
    const listed = await request.get('/api/v1/my/oauth-grants?limit=100').expect(200)
    const grant = listed.body.results.find(
      (candidate: ListedGrant) => candidate.client.client_id === flow.client.client_id,
    ) as ListedGrant

    const strangerRequest = createRequest()
    await strangerRequest.authenticateAs(stranger)
    await strangerRequest.delete(`/api/v1/my/oauth-grants/${grant.id}`).expect(404)

    await request.delete(`/api/v1/my/oauth-grants/${grant.id}`).expect(204)
    await request.delete(`/api/v1/my/oauth-grants/${grant.id}`).expect(404)
    const after = await request.get('/api/v1/my/oauth-grants?limit=100').expect(200)
    expect(after.body.results.map((candidate: ListedGrant) => candidate.id)).not.toContain(grant.id)
  })

  // Plan #285: an anonymous malformed id is a 401 with no diagnostic, an authenticated one a 422.
  it('rejects a malformed id with 401 anonymously and 422 when signed in', async () => {
    const anonymous = await createRequest().delete('/api/v1/my/oauth-grants/not-a-uuid')
    expect(anonymous.status).toBe(401)
    expect(anonymous.text).not.toMatch(/invalid/i)

    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete('/api/v1/my/oauth-grants/not-a-uuid').expect(422)
  })

  it('refuses a suspended user without revoking the grant', async () => {
    const suspended = await createTestUser()
    const flow = await authorize(suspended)
    const request = createRequest()
    await request.authenticateAs(suspended)
    const listed = await request.get('/api/v1/my/oauth-grants').expect(200)
    const grant = listed.body.results.find(
      (candidate: ListedGrant) => candidate.client.client_id === flow.client.client_id,
    ) as ListedGrant

    await suspendTestUser(suspended.id)
    try {
      const response = await request.delete(`/api/v1/my/oauth-grants/${grant.id}`).expect(403)
      expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    } finally {
      await unsuspendTestUser(suspended.id)
    }
    const after = await request.get('/api/v1/my/oauth-grants').expect(200)
    expect(after.body.results.map((candidate: ListedGrant) => candidate.id)).toContain(grant.id)
  })
})
