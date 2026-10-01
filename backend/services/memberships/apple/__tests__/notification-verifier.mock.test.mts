import { describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { sentryCaptureExceptionMock } from '../../../../test-helpers/vitest.setup.sentry-mock.mts'

const verifierFailure = vi.hoisted(() => ({
  enabled: false,
  error: new Error('Owned Apple SDK verifier initialization failed'),
}))

vi.mock(import('@apple/app-store-server-library'), async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    SignedDataVerifier: class extends actual.SignedDataVerifier {
      constructor(...args: ConstructorParameters<typeof actual.SignedDataVerifier>) {
        super(...args)
        if (verifierFailure.enabled) throw verifierFailure.error
      }
    },
  }
})

describe('Apple notification verifier initialization', () => {
  it('reports an SDK initialization failure and accepts a later verification attempt', async () => {
    const requestId = crypto.randomUUID()
    verifierFailure.enabled = true
    try {
      const response = await createRequest()
        .post('/api/v1/memberships/apple-app-store/notifications')
        .set('x-request-id', requestId)
        .send({ signedPayload: 'owned-malformed-signed-payload' })
        .expect(500)

      expect(response.headers['x-request-id']).toBe(requestId)
      expect(
        sentryCaptureExceptionMock.mock.calls.some(
          ([captured, context]) =>
            captured === verifierFailure.error && context?.tags?.request_id === requestId,
        ),
      ).toBe(true)
    } finally {
      verifierFailure.enabled = false
    }

    await createRequest()
      .post('/api/v1/memberships/apple-app-store/notifications')
      .send({ signedPayload: 'owned-malformed-signed-payload' })
      .expect(400)
  })
})
