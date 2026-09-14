import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as stripeClientModule from '@modules/stripe/client'
import {
  stripeCreateVerificationSession,
  stripeGetVerificationSession,
  stripeIdentityProvider,
  stripeRetrieveVerificationSessionUrl,
} from './identity.mts'

function makeStripeClient(sessionOverrides: Record<string, unknown> = {}) {
  return {
    identity: {
      verificationSessions: {
        retrieve: vi.fn<VitestLooseMock>().mockResolvedValue({
          status: 'verified',
          verified_outputs: {
            first_name: 'Jane',
            last_name: 'Doe',
            id_number: 'AB123456',
            id_number_type: null,
            address: { country: 'US' },
          },
          last_verification_report: {
            document: {
              type: 'passport',
              issuing_country: 'US',
              number: { value: 'AB123456' },
              first_name: { value: 'Jane' },
              last_name: { value: 'Doe' },
            },
          },
          ...sessionOverrides,
        }),
      },
    },
  }
}

describe('stripeIdentityProvider.getVerificationResult', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns verified outcome for a complete verified session', async () => {
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue(makeStripeClient() as never)
    const result = await stripeIdentityProvider.getVerificationResult('vs_test')
    expect(result.outcome).toBe('verified')
  })

  it('returns requires_input when documentNumber is absent on a verified session', async () => {
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue(
      makeStripeClient({
        verified_outputs: {
          first_name: 'Jane',
          last_name: 'Doe',
          id_number: null,
          id_number_type: null,
          address: { country: 'US' },
        },
        last_verification_report: {
          document: {
            type: 'passport',
            issuing_country: 'US',
            number: { value: null },
            first_name: { value: 'Jane' },
            last_name: { value: 'Doe' },
          },
        },
      }) as never,
    )
    const result = await stripeIdentityProvider.getVerificationResult('vs_test')
    expect(result.outcome).toBe('requires_input')
  })

  it('returns requires_input when issuingCountry is absent (no safe fingerprint keyspace)', async () => {
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue(
      makeStripeClient({
        verified_outputs: {
          first_name: 'Jane',
          last_name: 'Doe',
          id_number: 'AB123456',
          id_number_type: null,
          address: null,
        },
        last_verification_report: {
          document: {
            type: 'passport',
            issuing_country: null,
            number: { value: 'AB123456' },
            first_name: { value: 'Jane' },
            last_name: { value: 'Doe' },
          },
        },
      }) as never,
    )
    const result = await stripeIdentityProvider.getVerificationResult('vs_test')
    expect(result.outcome).toBe('requires_input')
  })

  it('returns requires_input when documentType is absent (no safe fingerprint keyspace)', async () => {
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue(
      makeStripeClient({
        verified_outputs: {
          first_name: 'Jane',
          last_name: 'Doe',
          id_number: 'AB123456',
          id_number_type: null,
          address: { country: 'US' },
        },
        last_verification_report: {
          document: {
            type: null,
            issuing_country: 'US',
            number: { value: 'AB123456' },
            first_name: { value: 'Jane' },
            last_name: { value: 'Doe' },
          },
        },
      }) as never,
    )
    const result = await stripeIdentityProvider.getVerificationResult('vs_test')
    expect(result.outcome).toBe('requires_input')
  })

  it('returns failed for a non-verified session status', async () => {
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue(
      makeStripeClient({ status: 'processing', last_verification_report: null }) as never,
    )
    const result = await stripeIdentityProvider.getVerificationResult('vs_test')
    expect(result.outcome).toBe('failed')
  })

  it('returns canceled for a canceled session', async () => {
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue(
      makeStripeClient({ status: 'canceled' }) as never,
    )
    const result = await stripeIdentityProvider.getVerificationResult('vs_test')
    expect(result.outcome).toBe('canceled')
  })

  it('returns requires_input for a requires_input session', async () => {
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue(
      makeStripeClient({ status: 'requires_input' }) as never,
    )
    const result = await stripeIdentityProvider.getVerificationResult('vs_test')
    expect(result.outcome).toBe('requires_input')
  })
})

describe('stripe identity module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates verification sessions with metadata and an idempotency key', async () => {
    const create = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue({ id: 'vs_new', url: 'https://stripe.test' })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      identity: { verificationSessions: { create } },
    } as never)

    await expect(
      stripeCreateVerificationSession(
        'user_123',
        'https://example.com/return',
        'cs_123',
        'idem_123',
      ),
    ).resolves.toEqual({ id: 'vs_new', url: 'https://stripe.test' })
    expect(create).toHaveBeenCalledWith(
      {
        type: 'document',
        metadata: { user_id: 'user_123', checkout_session_id: 'cs_123' },
        options: { document: { require_matching_selfie: true, require_live_capture: true } },
        return_url: 'https://example.com/return',
      },
      { idempotencyKey: 'idem_123' },
    )
  })

  it('creates verification sessions without request options when no idempotency key is provided', async () => {
    const create = vi.fn<VitestLooseMock>().mockResolvedValue({ id: 'vs_new', url: null })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      identity: { verificationSessions: { create } },
    } as never)

    await expect(
      stripeCreateVerificationSession('user_123', 'https://example.com/return', 'cs_123'),
    ).resolves.toEqual({ id: 'vs_new', url: null })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ type: 'document' }), undefined)
  })

  it('requires Stripe verification session URLs for provider-created sessions', async () => {
    const create = vi.fn<VitestLooseMock>().mockResolvedValue({ id: 'vs_new', url: null })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      identity: { verificationSessions: { create } },
    } as never)

    await expect(
      stripeIdentityProvider.createVerificationSession({
        userId: 'user_123',
        returnUrl: 'https://example.com/return',
        checkoutSessionId: 'cs_123',
      }),
    ).rejects.toThrow('Stripe Identity session missing URL')
  })

  it('returns null instead of retrieving empty verification session IDs', async () => {
    const getStripeClientSpy = vi.spyOn(stripeClientModule, 'getStripeClient')
    await expect(stripeIdentityProvider.getVerificationSessionUrl('')).resolves.toBeNull()
    expect(getStripeClientSpy).not.toHaveBeenCalled()
  })

  it('retrieves verification session URLs and expanded verification sessions', async () => {
    const retrieve = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue({ id: 'vs_123', url: 'https://stripe.test' })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      identity: { verificationSessions: { retrieve } },
    } as never)

    await expect(stripeRetrieveVerificationSessionUrl('vs_123')).resolves.toBe(
      'https://stripe.test',
    )
    await expect(stripeGetVerificationSession('vs_123')).resolves.toEqual({
      id: 'vs_123',
      url: 'https://stripe.test',
    })
    expect(retrieve).toHaveBeenNthCalledWith(1, 'vs_123')
    expect(retrieve).toHaveBeenNthCalledWith(2, 'vs_123', {
      expand: ['verified_outputs', 'last_verification_report.document'],
    })
  })
})
