import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatVerificationFee } from '../verification-fee'

describe('formatVerificationFee', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('formats the configured fee with the resolved UI locale', () => {
    vi.stubEnv('IDENTITY_VERIFICATION_FEE_MINOR_UNITS', '999')
    vi.stubEnv('IDENTITY_VERIFICATION_CURRENCY', 'usd')

    expect(formatVerificationFee('es')).toBe('9,99 US$')
  })
})
