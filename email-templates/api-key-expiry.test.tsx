import { describe, expect, it } from 'vitest'
import { renderApiKeyExpiryEmail } from './api-key-expiry-renderer.mts'

describe('API key expiry reminder', () => {
  it('renders an escaped label, deadline and owner settings link without a key secret', async () => {
    const result = await renderApiKeyExpiryEmail({
      label: '<script>reader</script>',
      expiresAt: '2026-10-08T12:00:00.000Z',
      apiKeysUrl: 'https://voucha.ai/my/api-keys',
      uiLocale: 'en',
    })
    expect(result.text).toContain('2026-10-08T12:00:00.000Z')
    expect(result.html).toContain('https://voucha.ai/my/api-keys')
    expect(result.html).not.toContain('<script>reader</script>')
    expect(result.text).not.toContain('voucha_rss_')
  })
})
