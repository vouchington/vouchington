import { describe, expect, it } from 'vitest'
import { assertSessionClientBinding, createSessionClientBinding } from './client-binding.mts'

const chrome = (version: string) =>
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/${version} Safari/537.36`

describe('session client binding', () => {
  it('retains browser-family and platform identity across version updates', () => {
    const binding = createSessionClientBinding(undefined, { user_agent: chrome('130.0.0.0') })
    expect(() => assertSessionClientBinding(binding, chrome('131.2.3.4'))).not.toThrow()
    expect(() =>
      assertSessionClientBinding(binding, 'Mozilla/5.0 (Macintosh) Chrome/131.0 Safari/537.36'),
    ).toThrow(expect.objectContaining({ code: 'SESSION_USER_AGENT_MISMATCH' }))
    expect(() =>
      assertSessionClientBinding(binding, 'Mozilla/5.0 (Windows NT 10.0) Firefox/131.0'),
    ).toThrow(expect.objectContaining({ code: 'SESSION_USER_AGENT_MISMATCH' }))
  })

  it.each(['FxiOS', 'EdgiOS'])(
    'retains the %s browser family on iOS without treating it as Safari',
    family => {
      const ua = (version: string) =>
        `Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 ${family}/${version} Mobile/15E148 Safari/605.1.15`
      const binding = createSessionClientBinding(undefined, { user_agent: ua('130.0') })
      expect(() => assertSessionClientBinding(binding, ua('131.0'))).not.toThrow()
      expect(() =>
        assertSessionClientBinding(binding, ua('131.0').replace(`${family}/131.0`, 'Version/18.0')),
      ).toThrow(expect.objectContaining({ code: 'SESSION_USER_AGENT_MISMATCH' }))
    },
  )

  it('compares JA4 only when both the original binding and current trusted signal exist', () => {
    const binding = createSessionClientBinding(undefined, {
      user_agent: chrome('130'),
      ja4: 'mint-ja4',
    })
    expect(binding).toHaveProperty('ja4_hash')
    expect(() => assertSessionClientBinding(binding, chrome('131'), 'mint-ja4')).not.toThrow()
    expect(() => assertSessionClientBinding(binding, chrome('131'))).not.toThrow()
    expect(() => assertSessionClientBinding(binding, chrome('131'), 'another-ja4')).toThrow(
      expect.objectContaining({ code: 'SESSION_JA4_MISMATCH' }),
    )
    const unscored = createSessionClientBinding(undefined, { user_agent: chrome('130') })
    expect(unscored).not.toHaveProperty('ja4_hash')
    expect(() => assertSessionClientBinding(unscored, chrome('131'), 'later-ja4')).not.toThrow()
  })

  it('uses unbound native identity only for a verified attested device class', () => {
    const binding = createSessionClientBinding('attested', {
      user_agent: chrome('130'),
      ja4: 'mint-ja4',
    })
    expect(binding).toEqual({ client: 'native' })
    expect(() =>
      assertSessionClientBinding(binding, 'different client', 'different-ja4'),
    ).not.toThrow()
    expect(createSessionClientBinding(undefined, { user_agent: chrome('130') }).client).toBe('web')
  })
})
