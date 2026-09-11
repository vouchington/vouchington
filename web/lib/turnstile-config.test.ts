import { describe, expect, it } from 'vitest'
import {
  getTurnstileSiteKey,
  TURNSTILE_TEST_SITE_KEY,
  TURNSTILE_TEST_SITE_KEYS,
} from './turnstile-config'

describe('turnstile-config', () => {
  describe('turnstile-config', () => {
    it('exposes the public Cloudflare always-pass test site key', async () => {
      expect(TURNSTILE_TEST_SITE_KEY).toBe('1x00000000000000000000AA')
    })

    it('getTurnstileSiteKey uses the runtime public config value when set', async () => {
      expect(getTurnstileSiteKey({ turnstileSiteKey: '0xMYREALSITEKEY' })).toBe('0xMYREALSITEKEY')
    })

    it('getTurnstileSiteKey trims whitespace from runtime public config', async () => {
      expect(getTurnstileSiteKey({ turnstileSiteKey: '  0xMYREALSITEKEY  ' })).toBe(
        '0xMYREALSITEKEY',
      )
    })

    it('getTurnstileSiteKey falls back to the test key when runtime config is unset or whitespace-only', async () => {
      expect(getTurnstileSiteKey({ turnstileSiteKey: '   ' })).toBe(TURNSTILE_TEST_SITE_KEY)
    })

    it('TURNSTILE_TEST_SITE_KEYS lists every public Cloudflare test site key', async () => {
      expect(TURNSTILE_TEST_SITE_KEYS).toContain(TURNSTILE_TEST_SITE_KEY)
      expect(TURNSTILE_TEST_SITE_KEYS).toEqual(
        expect.arrayContaining([
          '1x00000000000000000000AA',
          '2x00000000000000000000AB',
          '1x00000000000000000000BB',
          '2x00000000000000000000BB',
          '3x00000000000000000000FF',
        ]),
      )
    })
  })
})
