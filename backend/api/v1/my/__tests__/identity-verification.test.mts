import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createRandomString, createTestUser, setUserVerificationFields } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { getPrivateUserByAny } from '@services/users/get'
import * as stripeCheckout from '@modules/stripe/checkout'
import * as stripeCustomers from '@modules/stripe/customers'
import * as stripeIdentity from '@modules/stripe/identity'

const getOrCreateCustomerSpy = vi.spyOn(stripeCustomers, 'getOrCreateStripeCustomer')
const createCheckoutSpy = vi.spyOn(stripeCheckout, 'createOneTimeCheckoutSession')
const getSessionUrlSpy = vi.spyOn(stripeIdentity, 'stripeRetrieveVerificationSessionUrl')

describe('POST /api/v1/my/identity-verification/checkout-sessions', () => {
  let user: PrivateUser

  beforeAll(async () => {
    vi.stubEnv('PUBLIC_URL', 'http://localhost:3000')
    user = await createTestUser()
    await import('../identity-verification.mts')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    getOrCreateCustomerSpy.mockResolvedValue({ id: 'cus_test' } as never)
    createCheckoutSpy.mockResolvedValue({
      id: `cs_test_${createRandomString(12)}`,
      url: 'https://checkout.stripe.com/pay/cs_test',
    } as never)
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request
      .post('/api/v1/my/identity-verification/checkout-sessions')
      .set('Content-Type', 'application/json')
      .send({})
      .expect(401)
  })

  it('returns checkout URL for eligible user', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .post('/api/v1/my/identity-verification/checkout-sessions')
      .set('Content-Type', 'application/json')
      .send({})
      .expect(200)
    expect(response.body.url).toBe('https://checkout.stripe.com/pay/cs_test')
  })

  it('returns 409 when user is already verified', async () => {
    const verifiedUser = await createTestUser()
    await setUserVerificationFields(verifiedUser.id, { verificationStatus: 'verified' })
    const refreshed = (await getPrivateUserByAny(verifiedUser.id))!
    const request = createRequest()
    await request.authenticateAs(refreshed)
    await request
      .post('/api/v1/my/identity-verification/checkout-sessions')
      .set('Content-Type', 'application/json')
      .send({})
      .expect(409)
  })
})

describe('GET /api/v1/my/identity-verification/session-url', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    getSessionUrlSpy.mockResolvedValue('https://verify.stripe.com/vs_test')
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/identity-verification/session-url').expect(401)
  })

  it('returns 409 when user is not in identity_pending state', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.get('/api/v1/my/identity-verification/session-url').expect(409)
  })

  it('returns session URL for user in identity_pending state', async () => {
    const pendingUser = await createTestUser()
    await setUserVerificationFields(pendingUser.id, {
      verificationStatus: 'identity_pending',
      pendingVerificationSessionId: 'vs_test',
    })
    const refreshed = (await getPrivateUserByAny(pendingUser.id))!
    const request = createRequest()
    await request.authenticateAs(refreshed)
    const response = await request.get('/api/v1/my/identity-verification/session-url').expect(200)
    expect(response.body.url).toBe('https://verify.stripe.com/vs_test')
  })
})
