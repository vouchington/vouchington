import { describe, it } from 'vitest'
import { createTestUser, suspendTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'

describe('Microsoft Store service tickets', () => {
  it('requires a signed-in user before creating provider tickets', async () => {
    await createRequest().post('/api/v1/memberships/microsoft-store/service-tickets').expect(401)
  })

  it('does not request provider tickets for a suspended user', async () => {
    const user = await createTestUser()
    await suspendTestUser(user.id, 'Microsoft Store service-ticket test')
    const request = createRequest()
    await request.authenticateAs(user)

    await request.post('/api/v1/memberships/microsoft-store/service-tickets').expect(403)
  })
})
