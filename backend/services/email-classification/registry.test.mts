import { describe, expect, it } from 'vitest'
import { buildClassifiedSendParams } from './send-params.mts'
import {
  EMAIL_CLASSIFICATIONS,
  type EmailClassificationEntry,
  type EmailType,
} from './registry.mts'

describe('EMAIL_CLASSIFICATIONS registry', () => {
  it('has a valid shape for every entry', () => {
    for (const [type, entry] of Object.entries(EMAIL_CLASSIFICATIONS)) {
      expect(['transactional', 'marketing']).toContain(entry.classification)
      expect(typeof type).toBe('string')
    }

    const marketingEntries = Object.values(EMAIL_CLASSIFICATIONS).filter(
      (entry): entry is Extract<EmailClassificationEntry, { classification: 'marketing' }> =>
        entry.classification === 'marketing',
    )
    for (const entry of marketingEntries) {
      expect(typeof entry.hasActiveSender).toBe('boolean')
      expect(entry.unsubscribe.scheme).toBe('user-category')
    }

    const userCategoryUnsubscribes = marketingEntries
      .map(entry => entry.unsubscribe)
      .filter(
        (unsubscribe): unsubscribe is Extract<typeof unsubscribe, { scheme: 'user-category' }> =>
          unsubscribe.scheme === 'user-category',
      )
    for (const unsubscribe of userCategoryUnsubscribes) {
      expect(['outcome_emails', 'news_digest', 'community_digest']).toContain(unsubscribe.category)
    }
  })

  it('marks news digest as registry-only pending a sender', () => {
    expect(EMAIL_CLASSIFICATIONS.newsDigest).toEqual({
      classification: 'marketing',
      unsubscribe: { scheme: 'user-category', category: 'news_digest' },
      hasActiveSender: false,
    })
  })
})

describe('buildClassifiedSendParams', () => {
  it('sets only the transactional configuration set for transactional email', () => {
    const params = buildClassifiedSendParams('processSendWelcomeEmail', {})
    expect(params.headers).toBeUndefined()
    expect(params).toHaveProperty('configurationSetName')
  })

  it('builds user-category unsubscribe headers for marketing email with a userId', () => {
    const params = buildClassifiedSendParams('processSendFollowTopicsEmail', {
      userId: '00000000-0000-0000-0000-000000000001',
    })
    expect(params.headers).toHaveProperty('List-Unsubscribe')
    expect(params.headers).toHaveProperty('List-Unsubscribe-Post', 'List-Unsubscribe=One-Click')
  })

  it('throws a TypeError when a marketing type is requested without the required ctx field', () => {
    expect(() =>
      buildClassifiedSendParams('processSendFollowTopicsEmail' as EmailType, {}),
    ).toThrow(TypeError)
  })
})
