import { describe, expect, it } from 'vitest'
import { getBccAddresses, resolveBccAddress } from './ses.mts'

describe('resolveBccAddress', () => {
  it('prefers an explicit SES_BCC_EMAIL regardless of environment', () => {
    expect(resolveBccAddress('override@voucha.ai', true)).toBe('override@voucha.ai')
    expect(resolveBccAddress('override@voucha.ai', false)).toBe('override@voucha.ai')
  })

  it('treats an empty SES_BCC_EMAIL as unset rather than an invalid empty address', () => {
    expect(resolveBccAddress('', true)).toBe('bcc@voucha.ai')
  })

  it('uses the real production mailbox only when actually running in production', () => {
    expect(resolveBccAddress(undefined, true)).toBe('bcc@voucha.ai')
  })

  it('uses the dev mailbox everywhere else, including staging (NODE_ENV=production there too)', () => {
    expect(resolveBccAddress(undefined, false)).toBe('bcc-dev@voucha.ai')
  })
})

describe('getBccAddresses', () => {
  it('requires an explicit opt-out before omitting the global operational BCC', () => {
    expect(getBccAddresses({})).toHaveLength(1)
    expect(getBccAddresses({ allowGlobalBcc: false })).toEqual([])
  })
})
