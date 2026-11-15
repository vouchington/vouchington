import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { createTestPendingOAuthAuthorization } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { observeTestPostgresClientQueries } from '@voucha/test-helpers/postgres-query-pool-observer'
import { getTestOAuthAdmissionArtifacts } from '@voucha/test-helpers/oauth-admission-artifacts'
import {
  beginValidatedOAuthAuthorizationRequest,
  decideOAuthAuthorizationRequest,
  getOAuthAuthorizationRequestForUser,
} from './index.mts'

describe('authorization admission failures', () => {
  it('returns a structured conflict when another begin commits after supersession', async () => {
    const user = await createTestUserDirect()
    const pending = await createTestPendingOAuthAuthorization(user)
    await decideOAuthAuthorizationRequest(user.id, pending.requestId, 'deny', pending.bindingHash)
    let winnerId: string | undefined
    let raced = false
    await observeTestPostgresClientQueries(
      () =>
        expect(
          beginValidatedOAuthAuthorizationRequest(pending.parameters, pending.validated),
        ).rejects.toMatchObject({ code: 'invalid_request', status: 409 }),
      async query => {
        if (
          !raced &&
          query.text.includes('/* beginOAuthAuthorizationRequest supersede */') &&
          query.values.includes(pending.bindingHash)
        ) {
          raced = true
          winnerId = (
            await beginValidatedOAuthAuthorizationRequest(pending.parameters, pending.validated)
          ).request_id
        }
      },
    )
    expect(raced).toBe(true)
    expect(winnerId).toBeDefined()
    await expect(
      getOAuthAuthorizationRequestForUser(user.id, winnerId!, pending.bindingHash),
    ).resolves.toMatchObject({ id: winnerId })
    await expect(
      getOAuthAuthorizationRequestForUser(user.id, pending.requestId, pending.bindingHash),
    ).resolves.toBeNull()
  })

  it('propagates an insert failure and rolls back the superseded request', async () => {
    const user = await createTestUserDirect()
    const pending = await createTestPendingOAuthAuthorization(user)
    const failure = new Error('Owned authorization insert transport failure')
    let failed = false
    await observeTestPostgresClientQueries(
      () =>
        expect(
          beginValidatedOAuthAuthorizationRequest(pending.parameters, pending.validated),
        ).rejects.toBe(failure),
      async query => {
        if (
          !failed &&
          query.text.includes('/* beginOAuthAuthorizationRequest insert */') &&
          query.values.includes(pending.bindingHash)
        ) {
          failed = true
          throw failure
        }
      },
    )
    expect(failed).toBe(true)
    await expect(
      getOAuthAuthorizationRequestForUser(user.id, pending.requestId, pending.bindingHash),
    ).resolves.toMatchObject({ id: pending.requestId })
    expect(await getTestOAuthAdmissionArtifacts(user.id)).toMatchObject({
      requests: 1,
      grants: 0,
      codes: 0,
    })
  })
})
