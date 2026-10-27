import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildFollowTopicsEmailVariables,
  buildReferralProgramEmailVariables,
  buildFollowNewsSourcesEmailVariables,
} from './email-variables.mts'

const recipient = { username: 'member' }

describe('engagement email variables', () => {
  beforeEach(() => {
    vi.stubEnv('SITE_ORIGIN', 'https://app.example.test')
    vi.stubEnv('MARKETING_POSTAL_ADDRESS', '123 Example Street')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('keeps recommendation positions aligned across missing topics in the complete follow-topic email', () => {
    const recommendations = [
      { id: crypto.randomUUID(), reason: 'from_viewed_posts' },
      { id: crypto.randomUUID(), reason: 'from_followed_rss_feeds' },
    ]
    expect(
      buildFollowTopicsEmailVariables(recipient, recommendations, [
        null,
        { name: 'Travel', slug: 'travel' },
      ]),
    ).toEqual({
      userName: 'member',
      topics: [
        {
          name: 'Travel',
          url: 'https://app.example.test/topic/travel',
          reason: 'from_followed_rss_feeds',
        },
      ],
      settingsUrl: 'https://app.example.test/my/topics/following',
      unsubscribeUrl: 'https://app.example.test/my/notification-settings',
      physicalAddress: '123 Example Street',
    })
    expect(
      buildFollowTopicsEmailVariables(recipient, recommendations, [null, undefined]),
    ).toBeNull()
  })

  it('keeps referral counts aligned across missing programs and omits an absent username', () => {
    const programs = [
      { id: crypto.randomUUID(), link_count: 7 },
      { id: crypto.randomUUID(), link_count: 3 },
    ]
    expect(
      buildReferralProgramEmailVariables({ username: null }, programs, [
        undefined,
        { name: 'Travel Card', slug: 'travel-card' },
      ]),
    ).toEqual({
      userName: undefined,
      referralPrograms: [
        {
          name: 'Travel Card',
          url: 'https://app.example.test/referral-program/travel-card',
          linkCount: 3,
        },
      ],
      settingsUrl: 'https://app.example.test/my/referral-links',
      unsubscribeUrl: 'https://app.example.test/my/notification-settings',
      physicalAddress: '123 Example Street',
    })
    expect(buildReferralProgramEmailVariables(recipient, programs, [undefined, null])).toBeNull()
  })

  it('builds source variables from available feeds without inventing empty descriptions', () => {
    const feeds = [
      null,
      {
        id: crypto.randomUUID(),
        title: 'Travel Daily',
        topic: { slug: 'travel-daily', markdown: '' },
      },
      undefined,
      {
        id: crypto.randomUUID(),
        title: 'Points Wire',
        topic: { slug: 'points-wire', markdown: 'Loyalty news.' },
      },
    ]
    expect(buildFollowNewsSourcesEmailVariables(recipient, feeds)).toEqual({
      userName: 'member',
      sources: [
        {
          name: 'Travel Daily',
          url: 'https://app.example.test/source/travel-daily',
          description: undefined,
        },
        {
          name: 'Points Wire',
          url: 'https://app.example.test/source/points-wire',
          description: 'Loyalty news.',
        },
      ],
      settingsUrl: 'https://app.example.test/my/news-sources',
      unsubscribeUrl: 'https://app.example.test/my/notification-settings',
      physicalAddress: '123 Example Street',
    })
    expect(buildFollowNewsSourcesEmailVariables(recipient, [null, undefined])).toBeNull()
  })
})
