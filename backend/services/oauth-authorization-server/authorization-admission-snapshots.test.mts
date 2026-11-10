import { describe, expect, it } from 'vitest'
import { createTestUserDirect, suspendTestUser } from '@voucha/test-helpers/entities/users'
import { observeTestPostgresClientQueries } from '@voucha/test-helpers/postgres-query-pool-observer'
import { getTestOAuthAdmissionArtifacts } from '@voucha/test-helpers/oauth-admission-artifacts'
import { createTestPendingOAuthAuthorization } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { decideOAuthAuthorizationRequest } from './consent.mts'

describe('OAuth written-statement admission snapshots', () => {
  it('denies a new request when suspension commits after preliminary authority checks', async () => {
    const user = await createTestUserDirect()
    let suspended = false
    await observeTestPostgresClientQueries(
      () =>
        expect(createTestPendingOAuthAuthorization(user)).rejects.toMatchObject({
          code: 'access_denied',
          status: 403,
        }),
      async query => {
        if (!suspended && query.text.includes('/* beginOAuthAuthorizationRequest supersede */')) {
          suspended = true
          await suspendTestUser(user.id)
        }
      },
    )
    expect(suspended).toBe(true)
    expect(await getTestOAuthAdmissionArtifacts(user.id)).toEqual({
      requests: 0,
      approved_requests: 0,
      grants: 0,
      codes: 0,
      events: 0,
    })
  })

  it('denies consent without artifacts when suspension commits after the request read', async () => {
    const user = await createTestUserDirect()
    const pending = await createTestPendingOAuthAuthorization(user)
    let suspended = false
    await observeTestPostgresClientQueries(
      () =>
        expect(
          decideOAuthAuthorizationRequest(
            user.id,
            pending.requestId,
            'approve',
            pending.bindingHash,
          ),
        ).rejects.toMatchObject({ code: 'access_denied', status: 403 }),
      async query => {
        if (!suspended && query.text.includes('/* lockAuthorizationRequest */')) {
          suspended = true
          await suspendTestUser(user.id)
        }
      },
    )
    expect(suspended).toBe(true)
    expect(await getTestOAuthAdmissionArtifacts(user.id)).toEqual({
      requests: 1,
      approved_requests: 0,
      grants: 0,
      codes: 0,
      events: 0,
    })
  })
})
