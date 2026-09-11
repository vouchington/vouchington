import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { randomUUID } from 'node:crypto'
import type { Context } from '@jongleberry/api-server'
import {
  createAppAttestAssertionHeaders,
  TEST_APP_ATTEST_BUNDLE_ID,
  TEST_APP_ATTEST_TEAM_ID,
} from '@voucha/test-helpers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appAttestationConfig } from '@services/app-attestation'
import { verifyCaptchaOrAttestation } from './verify-or-attestation.mts'

function fakeContext(headers: Record<string, string>, did: string, ip = '127.0.0.1'): Context {
  return {
    req: { headers },
    ip,
    getDeviceTokenData: async () => ({ did }),
    hasVerifiedRequestSignature: () => false,
  } as unknown as Context
}

describe('verifyCaptchaOrAttestation', () => {
  beforeEach(() => {
    vi.stubEnv('APPLE_APP_ATTEST_TEAM_ID', TEST_APP_ATTEST_TEAM_ID)
    vi.stubEnv('APPLE_APP_ATTEST_BUNDLE_ID', TEST_APP_ATTEST_BUNDLE_ID)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    deleteDynamicConfigFieldsForTest(
      appAttestationConfig,
      Object.keys(appAttestationConfig.fieldTypes),
    )
  })

  it('skips all verification when per-request signature is verified and App Attest bypass is active', async () => {
    overrideDynamicConfigFieldsForTest(appAttestationConfig, { enabled: true })
    overrideDynamicConfigFieldsForTest(appAttestationConfig, {
      require_attestation_for_bypass: true,
    })

    const ctx = {
      req: { headers: {} },
      ip: '127.0.0.1',
      getDeviceTokenData: async () => ({ did: randomUUID() }),
      hasVerifiedRequestSignature: () => true,
    } as unknown as Context

    await expect(
      verifyCaptchaOrAttestation(ctx, {}, { actionTag: 'posts.create' }),
    ).resolves.toBeUndefined()
  })

  it('grants the bypass and skips Turnstile when the assertion is valid', async () => {
    overrideDynamicConfigFieldsForTest(appAttestationConfig, { enabled: true })
    overrideDynamicConfigFieldsForTest(appAttestationConfig, {
      require_attestation_for_bypass: true,
    })

    const did = randomUUID()
    const headers = await createAppAttestAssertionHeaders({ did, actionTag: 'posts.create' })
    const ctx = fakeContext(headers, did)

    await expect(
      verifyCaptchaOrAttestation(ctx, {}, { actionTag: 'posts.create' }),
    ).resolves.toBeUndefined()
  })

  it('throws without falling back to Turnstile when the caller device does not match the key that was attested', async () => {
    overrideDynamicConfigFieldsForTest(appAttestationConfig, { enabled: true })
    overrideDynamicConfigFieldsForTest(appAttestationConfig, {
      require_attestation_for_bypass: true,
    })

    const headers = await createAppAttestAssertionHeaders({
      did: randomUUID(),
      actionTag: 'posts.create',
    })
    // A different caller did than the one the key was attested under -- this is the
    // signing-oracle gap: a valid signature from a device bound to someone else's session.
    const ctx = fakeContext(headers, randomUUID())

    await expect(
      verifyCaptchaOrAttestation(ctx, {}, { actionTag: 'posts.create' }),
    ).rejects.toMatchObject({ status: 403, code: 'ATTESTATION_REJECTED' })
  })

  it('throws without falling back to Turnstile when the key was attested under a now-disallowed development environment', async () => {
    overrideDynamicConfigFieldsForTest(appAttestationConfig, { enabled: true })
    overrideDynamicConfigFieldsForTest(appAttestationConfig, {
      require_attestation_for_bypass: true,
    })

    const did = randomUUID()
    const headers = await createAppAttestAssertionHeaders({
      did,
      actionTag: 'posts.create',
      environment: 'development',
    })
    const ctx = fakeContext(headers, did)

    await expect(
      verifyCaptchaOrAttestation(ctx, {}, { actionTag: 'posts.create' }),
    ).rejects.toMatchObject({ status: 403, code: 'ATTESTATION_REJECTED' })
  })

  it('throws without falling back to Turnstile when the assertion is invalid', async () => {
    overrideDynamicConfigFieldsForTest(appAttestationConfig, { enabled: true })
    overrideDynamicConfigFieldsForTest(appAttestationConfig, {
      require_attestation_for_bypass: true,
    })

    const ctx = fakeContext(
      {
        'x-app-attest-key-id': 'unknown-key-id',
        'x-app-attest-assertion': Buffer.from('garbage').toString('base64'),
        'x-app-attest-challenge-id': `missing-challenge-${randomUUID()}`,
      },
      randomUUID(),
    )

    await expect(
      verifyCaptchaOrAttestation(ctx, {}, { actionTag: 'posts.create' }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('rejects with a coded 403 when App Attest bypass is not enabled', async () => {
    const did = randomUUID()
    const headers = await createAppAttestAssertionHeaders({ did, actionTag: 'posts.create' })
    const ctx = fakeContext(headers, did)

    await expect(
      verifyCaptchaOrAttestation(ctx, {}, { actionTag: 'posts.create' }),
    ).rejects.toMatchObject({ status: 403, code: 'BYPASS_DISABLED' })
  })

  it('falls back to Turnstile verification when App Attest headers are absent', async () => {
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')
    const ctx = fakeContext({}, randomUUID())

    await expect(
      verifyCaptchaOrAttestation(ctx, {}, { actionTag: 'posts.create' }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('falls back to Turnstile verification when only some App Attest headers are present', async () => {
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')
    const ctx = fakeContext({ 'x-app-attest-key-id': 'partial-only' }, randomUUID())

    await expect(
      verifyCaptchaOrAttestation(ctx, {}, { actionTag: 'posts.create' }),
    ).rejects.toMatchObject({ status: 422 })
  })
})
