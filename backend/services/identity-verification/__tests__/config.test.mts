import { afterEach, describe, expect, it, vi } from 'vitest'

describe('identity verification money configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('rejects a fee outside the JSON-safe integer range', async () => {
    vi.stubEnv('IDENTITY_VERIFICATION_FEE_MINOR_UNITS', '9007199254740992')
    vi.resetModules()

    await expect(import('@voucha/config/identity-verification')).rejects.toThrow(
      'Invalid IDENTITY_VERIFICATION_FEE_MINOR_UNITS',
    )
  })

  it('rejects non-canonical currency codes', async () => {
    vi.stubEnv('IDENTITY_VERIFICATION_CURRENCY', 'USD')
    vi.resetModules()

    await expect(import('@voucha/config/identity-verification')).rejects.toThrow(
      'Invalid IDENTITY_VERIFICATION_CURRENCY',
    )
  })

  it('rejects lowercase currency codes outside the shared catalog', async () => {
    vi.stubEnv('IDENTITY_VERIFICATION_CURRENCY', 'nzd')
    vi.resetModules()

    await expect(import('@voucha/config/identity-verification')).rejects.toThrow(
      'Invalid IDENTITY_VERIFICATION_CURRENCY',
    )
  })
})
