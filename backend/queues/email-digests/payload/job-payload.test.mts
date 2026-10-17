import { describe, expect, it } from 'vitest'
import { parseEmailDigestJob } from './job-payload.mts'

describe('parseEmailDigestJob', () => {
  it('accepts empty dispatcher payloads and rejects unknown jobs', () => {
    expect(parseEmailDigestJob('dispatchEngagementEmails', null)).toEqual({
      kind: 'dispatcher',
      data: {},
      name: 'dispatchEngagementEmails',
    })
    expect(parseEmailDigestJob('dispatchCommunityModerationSummaryEmails', undefined)).toEqual({
      kind: 'dispatcher',
      data: {},
      name: 'dispatchCommunityModerationSummaryEmails',
    })
    expect(parseEmailDigestJob('dispatchEngagementEmails', {}).kind).toBe('dispatcher')
    expect(() => parseEmailDigestJob('dispatchEngagementEmails', { extra: true })).toThrow(
      /unexpected property extra/,
    )
    expect(() => parseEmailDigestJob('missingJob', {})).toThrow(/unknown job missingJob/)
    expect(() => parseEmailDigestJob('processSendWelcomeEmail', {})).toThrow(/unknown job/)
    expect(
      parseEmailDigestJob('dispatchApiKeyExpiryReminders', { afterId: 'owned-cursor' }),
    ).toEqual({
      kind: 'dispatcher',
      name: 'dispatchApiKeyExpiryReminders',
      data: { afterId: 'owned-cursor' },
    })
    expect(() => parseEmailDigestJob('dispatchApiKeyExpiryReminders', { afterId: 1 })).toThrow(
      /afterId must be a string/,
    )
  })

  it('accepts only a durable UUID for API-key expiry jobs', () => {
    const apiKeyId = '00000000-0000-7000-8000-000000000042'
    expect(parseEmailDigestJob('processSendApiKeyExpiryReminder', { apiKeyId })).toEqual({
      kind: 'api-key-expiry',
      apiKeyId,
    })
    expect(() => parseEmailDigestJob('processSendApiKeyExpiryReminder', {})).toThrow(
      /must be a UUID/,
    )
    expect(() => parseEmailDigestJob('processSendApiKeyExpiryReminder', { apiKeyId: 42 })).toThrow(
      /must be a UUID/,
    )
    expect(() =>
      parseEmailDigestJob('processSendApiKeyExpiryReminder', { apiKeyId: 'not-a-uuid' }),
    ).toThrow(/must be a UUID/)
    expect(() =>
      parseEmailDigestJob('processSendApiKeyExpiryReminder', { apiKeyId, rawKey: 'secret' }),
    ).toThrow(/unexpected property rawKey/)
    expect(() => parseEmailDigestJob('dispatchApiKeyExpiryReminders', { apiKeyId })).toThrow(
      /unexpected property apiKeyId/,
    )
  })
})
