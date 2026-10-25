import { describe, expect, it } from 'vitest'
import { toTurnstileAction } from './turnstile-action.mts'
import { BOT_CHALLENGE_ACTION, BOT_CHALLENGE_ACTION_TAG } from './bot-challenge.mts'

const applicationTags = [
  'auth.email-address-tokens',
  'posts.create',
  'communities.create-post',
  'communities.create',
  'reports.create',
  'appeals.create',
  'disputes.create',
  'topic-recommendations.create',
  'copyright-notices.create',
  'copyright-notices.appeal',
  'copyright-notices.counter-notice',
  'copyright-notices.guest-filing',
  'copyright-eu-notices.create',
  'copyright-eu-redress.create',
  'copyright-uk-notices.create',
  BOT_CHALLENGE_ACTION_TAG,
]

describe('browser challenge action mapping', () => {
  it('preserves distinct valid Cloudflare actions for every protected application flow', () => {
    const actions = applicationTags.map(toTurnstileAction)
    expect(actions.every(action => /^[A-Za-z0-9_-]{1,32}$/.test(action))).toBe(true)
    expect(new Set(actions).size).toBe(applicationTags.length)
    expect(toTurnstileAction('posts.create')).toBe('posts-create')
    expect(BOT_CHALLENGE_ACTION).toBe(toTurnstileAction(BOT_CHALLENGE_ACTION_TAG))
  })
  it.each(['', 'x'.repeat(33), 'invalid/tag'])('rejects unsupported action tags (%s)', tag => {
    expect(() => toTurnstileAction(tag)).toThrow('Invalid Turnstile action')
  })
})
