import { afterEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers'
import { grantConsent } from '@services/user-consents/create'
import { getActiveConsents } from '@services/user-consents/get'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'

describe('suspended consent exceptions', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it('allows own consent revocation but blocks a new consent grant', async () => {
    const user = await createTestUser()
    await grantConsent(user.id, 'cookie_analytics', '1.0')
    const request = createRequest()
    await request.authenticateAs(user)
    suspendedUserIds.push(user.id)
    await suspendTestUser(user.id)

    await request.delete('/api/v1/my/consents/cookie_analytics').expect(204)
    expect(await getActiveConsents(user.id)).toEqual([])

    const grant = await request
      .post('/api/v1/my/consents')
      .send({ consent_type: 'terms_of_service', version: '2.0' })
    expect(grant.status).toBe(403)
    expect(grant.body.code).toBe(ACCOUNT_SUSPENDED)
    expect(await getActiveConsents(user.id)).toEqual([])
  })
})
