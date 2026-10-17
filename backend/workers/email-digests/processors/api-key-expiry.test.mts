import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as ses from '@modules/aws/ses'
import { createTestUser } from '@voucha/test-helpers'
import { setTestApiKeyExpiry, getTestApiKeyLifecycle } from '@voucha/test-helpers/entities/api-keys'
import { createApiKey, revokeApiKey, rotateApiKey } from '@services/api-keys'
import { processSendApiKeyExpiryReminder } from './api-key-expiry.mts'

describe('API key reminder delivery', () => {
  beforeAll(() => {
    process.env.API_KEY_CHECKSUM_SECRET ??= 'synthetic reminder checksum secret'
  })
  beforeEach(() => vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never))
  afterEach(() => vi.restoreAllMocks())

  async function dueKey() {
    const user = await createTestUser()
    const key = await createApiKey(user.id, 'rss', 'My feed reader', ['rss:read'])
    await setTestApiKeyExpiry(key.apiKey.id, new Date(Date.now() + 6 * 86400000))
    return key
  }

  it('sends one classified email across concurrent and sequential retries', async () => {
    const key = await dueKey()
    await Promise.all([
      processSendApiKeyExpiryReminder(key.apiKey.id),
      processSendApiKeyExpiryReminder(key.apiKey.id),
    ])
    await processSendApiKeyExpiryReminder(key.apiKey.id)
    expect(ses.sendEmail).toHaveBeenCalledOnce()
    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Your API key expires soon',
        text: expect.stringContaining('My feed reader'),
      }),
    )
    expect((await getTestApiKeyLifecycle(key.apiKey.id)).expiry_reminder_sent_at).not.toBeNull()
  })

  it('never resends after an uncertain provider outcome', async () => {
    const key = await dueKey()
    vi.mocked(ses.sendEmail).mockRejectedValueOnce(new Error('Provider reply lost'))
    await expect(processSendApiKeyExpiryReminder(key.apiKey.id)).rejects.toThrow(
      'Provider reply lost',
    )
    expect(await processSendApiKeyExpiryReminder(key.apiKey.id)).toBeNull()
    expect(ses.sendEmail).toHaveBeenCalledOnce()
  })

  it.each(['revoked', 'replaced', 'expired', 'not-due'] as const)(
    'does not send for %s keys',
    async state => {
      const key = await dueKey()
      if (state === 'revoked') await revokeApiKey(key.apiKey.user_id, key.apiKey.id)
      if (state === 'replaced') await rotateApiKey(key.apiKey.user_id, key.apiKey.id)
      if (state === 'expired') await setTestApiKeyExpiry(key.apiKey.id, new Date(Date.now() - 1000))
      if (state === 'not-due')
        await setTestApiKeyExpiry(key.apiKey.id, new Date(Date.now() + 8 * 86400000))
      expect(await processSendApiKeyExpiryReminder(key.apiKey.id)).toBeNull()
      expect(ses.sendEmail).not.toHaveBeenCalled()
    },
  )
})
