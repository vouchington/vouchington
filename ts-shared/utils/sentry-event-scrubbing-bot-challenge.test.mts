import { describe, expect, it } from 'vitest'
import { scrubSentryEvent, scrubSpanAttributes } from './sentry-event-scrubbing.mts'

describe('bot challenge credential scrubbing', () => {
  it('redacts browser and native challenge proof headers', () => {
    expect(
      scrubSentryEvent({
        request: {
          headers: {
            'X-Voucha-Bot-Challenge-Token': 'turnstile-proof',
            'X-Voucha-Bot-Challenge-App-Attest-Assertion': 'generic-assertion-proof',
            'X-Voucha-Bot-Challenge-App-Attest-Challenge-ID': 'generic-challenge-capability',
          },
        },
      }),
    ).toEqual({
      request: {
        headers: {
          'X-Voucha-Bot-Challenge-Token': '[Filtered]',
          'X-Voucha-Bot-Challenge-App-Attest-Assertion': '[Filtered]',
          'X-Voucha-Bot-Challenge-App-Attest-Challenge-ID': '[Filtered]',
        },
      },
    })
  })

  it('redacts normalized bot challenge span attributes', () => {
    expect(
      scrubSpanAttributes({
        'http.request.header.x_voucha_bot_challenge_token': 'turnstile-proof',
        'http.request.header.x-voucha-bot-challenge-token': 'turnstile-proof-hyphenated',
        'http.request.header.x_voucha_bot_challenge_app_attest_assertion':
          'generic-assertion-proof',
        'http.request.header.x-voucha-bot-challenge-app-attest-assertion':
          'generic-assertion-proof-hyphenated',
        'http.request.header.x_voucha_bot_challenge_app_attest_challenge_id':
          'generic-challenge-capability',
        'http.request.header.x-voucha-bot-challenge-app-attest-challenge-id':
          'generic-challenge-capability-hyphenated',
      }),
    ).toEqual({
      'http.request.header.x_voucha_bot_challenge_token': '[Filtered]',
      'http.request.header.x-voucha-bot-challenge-token': '[Filtered]',
      'http.request.header.x_voucha_bot_challenge_app_attest_assertion': '[Filtered]',
      'http.request.header.x-voucha-bot-challenge-app-attest-assertion': '[Filtered]',
      'http.request.header.x_voucha_bot_challenge_app_attest_challenge_id': '[Filtered]',
      'http.request.header.x-voucha-bot-challenge-app-attest-challenge-id': '[Filtered]',
    })
  })
})
