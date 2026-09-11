import { describe, expect, it } from 'vitest'
import { normalizeHashtag, normalizeHashtagQuery } from './hashtags.mts'

describe('normalizeHashtag', () => {
  it('normalizes optional hash and mobile separators', () => {
    expect(normalizeHashtag(' #Me.Too__2026 ')).toEqual({
      authored: '#Me.Too__2026',
      key: 'me-too-2026',
    })
  })

  it('rejects invalid canonical hashtag grammar and overlong values', () => {
    expect(normalizeHashtag(`#${'a'.repeat(254)}`)).toEqual({
      authored: `#${'a'.repeat(254)}`,
      key: 'a'.repeat(254),
    })
    expect(normalizeHashtag('#-leading')).toBeNull()
    expect(normalizeHashtag('#trailing-')).toBeNull()
    expect(normalizeHashtag('#emoji-🙂')).toBeNull()
    expect(normalizeHashtag(`#${'a'.repeat(256)}`)).toBeNull()
    expect(normalizeHashtag(`#${'.'.repeat(255)}a`)).toBeNull()
    expect(normalizeHashtag(`#${'_'.repeat(255)}a`)).toBeNull()
  })

  it('normalizes search fragments without requiring complete hashtag grammar', () => {
    expect(normalizeHashtagQuery(' #Me.Too__2026- ')).toBe('me-too-2026-')
  })
})
