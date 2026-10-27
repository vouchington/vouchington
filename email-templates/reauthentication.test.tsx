import { describe, expect, it } from 'vitest'
import ReauthenticationEmail from './reauthentication.tsx'

describe('reauthentication email', () => {
  it.each(['en', 'es', 'fr', 'pt'])(
    'renders a code and the actual expiry in both formats (%s)',
    async uiLocale => {
      const result = await ReauthenticationEmail.render({
        token: 'ABCDEFG234',
        expiresInMinutes: 15,
        uiLocale,
      })
      expect(result.html).toContain('ABCDEFG234')
      expect(result.text).toContain('ABCDEFG234')
      expect(result.html).toContain('15')
      expect(result.text).toContain('15')
      expect(result.html).not.toContain('/login?')
    },
  )

  it('uses the supplied expiry rather than a fixed lifetime', async () => {
    const result = await ReauthenticationEmail.render({ token: 'ABCDEFG234', expiresInMinutes: 7 })
    expect(result.text).toContain('7 minutes')
    expect(result.text).not.toContain('15 minutes')
  })
})
