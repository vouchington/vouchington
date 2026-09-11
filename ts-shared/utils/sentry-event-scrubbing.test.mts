import { describe, expect, it } from 'vitest'
import {
  composeSentryBeforeSend,
  scrubRequestCredentialFields,
  scrubSentryEvent,
  scrubSpanAttributes,
  scrubSpanCredentialAttributes,
} from './sentry-event-scrubbing.mts'

describe('Sentry request metadata scrubbing', () => {
  it('redacts credential headers and request cookies', () => {
    const safeHeaders = { 'user-agent': 'test', accept: 'application/json' }
    const result = scrubRequestCredentialFields({
      headers: {
        ...safeHeaders,
        Authorization: 'Bearer secret',
        'Proxy-Authorization': 123,
        'X-API-Key': undefined,
        'CF-Access-JWT-Assertion': 'jwt',
        'X-Cf-WoRkEr-SeCrEt': 'worker-secret',
        'X-BedRock-Batch-Shared-Key': 'bedrock-key',
        'X-Voucha-Cache-Purge-Secret': 'cache-purge-secret',
        'X-App-Attest-Assertion': 'assertion-proof',
        'X-App-Attest-Nonce': 'single-use-nonce',
        'X-App-Attest-Challenge-ID': 'challenge-capability',
        'X-App-Attest-Key-ID': 'public-key-id',
        'X-App-Attest-Timestamp': '1700000000',
        'Stripe-Signature': 't=1700000000,v1=stripe-proof',
        SiGnAtUrE: 'keyId="actor",signature="activitypub-proof"',
        Cookie: 'st=secret; dt=secret',
      },
      cookies: { st: 'session', dt: 42, custom: undefined },
    })

    expect(result).toEqual({
      headers: {
        ...safeHeaders,
        Authorization: '[Filtered]',
        'Proxy-Authorization': '[Filtered]',
        'X-API-Key': '[Filtered]',
        'CF-Access-JWT-Assertion': '[Filtered]',
        'X-Cf-WoRkEr-SeCrEt': '[Filtered]',
        'X-BedRock-Batch-Shared-Key': '[Filtered]',
        'X-Voucha-Cache-Purge-Secret': '[Filtered]',
        'X-App-Attest-Assertion': '[Filtered]',
        'X-App-Attest-Nonce': '[Filtered]',
        'X-App-Attest-Challenge-ID': '[Filtered]',
        'X-App-Attest-Key-ID': 'public-key-id',
        'X-App-Attest-Timestamp': '1700000000',
        'Stripe-Signature': '[Filtered]',
        SiGnAtUrE: '[Filtered]',
        Cookie: '[Filtered]',
      },
      cookies: { st: '[Filtered]', dt: '[Filtered]', custom: '[Filtered]' },
    })
  })

  it('preserves request and nested references when credentials are already safe', () => {
    const headers = { authorization: '[Filtered]', accept: 'application/json' }
    const cookies = { st: '[Filtered]' }
    const request = { headers, cookies }

    expect(scrubRequestCredentialFields(request)).toBe(request)
    expect(scrubRequestCredentialFields(request)?.headers).toBe(headers)
    expect(scrubRequestCredentialFields(request)?.cookies).toBe(cookies)
  })

  it('preserves adversarial header and cookie names as own data properties', () => {
    const headers = Object.fromEntries([
      ['constructor', 'safe-constructor'],
      ['__proto__', 'safe-proto'],
      ['authorization', 'Bearer secret'],
    ])
    const cookies = Object.fromEntries([
      ['constructor', 'cookie-constructor'],
      ['__proto__', 'cookie-proto'],
      ['st', 'session'],
    ])

    const result = scrubRequestCredentialFields({ headers, cookies })
    const resultHeaders = result?.headers as Record<string, unknown>
    const resultCookies = result?.cookies as Record<string, unknown>
    expect(Object.hasOwn(resultHeaders, 'constructor')).toBe(true)
    expect(Object.hasOwn(resultHeaders, '__proto__')).toBe(true)
    expect(resultHeaders.constructor).toBe('safe-constructor')
    expect(Object.getOwnPropertyDescriptor(resultHeaders, '__proto__')?.value).toBe('safe-proto')
    expect(resultHeaders.authorization).toBe('[Filtered]')
    expect(Object.hasOwn(resultCookies, 'constructor')).toBe(true)
    expect(Object.hasOwn(resultCookies, '__proto__')).toBe(true)
    expect(resultCookies.constructor).toBe('[Filtered]')
    expect(Object.getOwnPropertyDescriptor(resultCookies, '__proto__')?.value).toBe('[Filtered]')
    expect(resultCookies.st).toBe('[Filtered]')
  })

  it('preserves no-op identity with already-filtered adversarial cookie names', () => {
    const request = {
      headers: Object.fromEntries([
        ['constructor', 'safe-constructor'],
        ['__proto__', 'safe-proto'],
      ]),
      cookies: Object.fromEntries([
        ['constructor', '[Filtered]'],
        ['__proto__', '[Filtered]'],
      ]),
    }

    expect(scrubRequestCredentialFields(request)).toBe(request)
  })

  it('redacts normalized credential and cookie span attributes', () => {
    expect(
      scrubSpanAttributes({
        'http.request.header.authorization': 'Bearer secret',
        'http.request.header.proxy_authorization': 'Basic secret',
        'http.request.header.x_api_key': 123,
        'http.request.header.cf_access_jwt_assertion': 'jwt',
        'http.request.header.x_cf_worker_secret': 'worker-secret',
        'http.request.header.x-cf-worker-secret': 'worker-secret-hyphenated',
        'http.request.header.x_bedrock_batch_shared_key': 'bedrock-key',
        'http.request.header.x-bedrock-batch-shared-key': 'bedrock-key-hyphenated',
        'http.request.header.x_voucha_cache_purge_secret': 'cache-purge-secret',
        'http.request.header.x-voucha-cache-purge-secret': 'cache-purge-secret-hyphenated',
        'http.request.header.x_app_attest_assertion': 'assertion-proof',
        'http.request.header.x-app-attest-assertion': 'assertion-proof-hyphenated',
        'http.request.header.x_app_attest_nonce': 'single-use-nonce',
        'http.request.header.x-app-attest-nonce': 'single-use-nonce-hyphenated',
        'http.request.header.x_app_attest_challenge_id': 'challenge-capability',
        'http.request.header.x-app-attest-challenge-id': 'challenge-capability-hyphenated',
        'http.request.header.x_app_attest_key_id': 'public-key-id',
        'http.request.header.x_app_attest_timestamp': '1700000000',
        'http.request.header.stripe_signature': 'stripe-proof',
        'http.request.header.stripe-signature': 'stripe-proof-hyphenated',
        'http.request.header.signature': 'activitypub-proof',
        'http.request.header.cookie': 'st=secret',
        'http.request.header.cookie.st': 'secret',
        'http.request.header.cookie.dt': undefined,
        'http.request.header.user_agent': 'test',
      }),
    ).toEqual({
      'http.request.header.authorization': '[Filtered]',
      'http.request.header.proxy_authorization': '[Filtered]',
      'http.request.header.x_api_key': '[Filtered]',
      'http.request.header.cf_access_jwt_assertion': '[Filtered]',
      'http.request.header.x_cf_worker_secret': '[Filtered]',
      'http.request.header.x-cf-worker-secret': '[Filtered]',
      'http.request.header.x_bedrock_batch_shared_key': '[Filtered]',
      'http.request.header.x-bedrock-batch-shared-key': '[Filtered]',
      'http.request.header.x_voucha_cache_purge_secret': '[Filtered]',
      'http.request.header.x-voucha-cache-purge-secret': '[Filtered]',
      'http.request.header.x_app_attest_assertion': '[Filtered]',
      'http.request.header.x-app-attest-assertion': '[Filtered]',
      'http.request.header.x_app_attest_nonce': '[Filtered]',
      'http.request.header.x-app-attest-nonce': '[Filtered]',
      'http.request.header.x_app_attest_challenge_id': '[Filtered]',
      'http.request.header.x-app-attest-challenge-id': '[Filtered]',
      'http.request.header.x_app_attest_key_id': 'public-key-id',
      'http.request.header.x_app_attest_timestamp': '1700000000',
      'http.request.header.stripe_signature': '[Filtered]',
      'http.request.header.stripe-signature': '[Filtered]',
      'http.request.header.signature': '[Filtered]',
      'http.request.header.cookie': '[Filtered]',
      'http.request.header.cookie.st': '[Filtered]',
      'http.request.header.cookie.dt': '[Filtered]',
      'http.request.header.user_agent': 'test',
    })
  })

  it('redacts Grafana heartbeat credentials through the exported span pipeline', () => {
    expect(
      scrubSpanAttributes({
        'url.full':
          'https://oncall-prod-us-central-0.grafana.net/oncall/integrations/v1/formatted_webhook/secret-token/heartbeat/',
      }),
    ).toEqual({
      'url.full':
        'https://oncall-prod-us-central-0.grafana.net/oncall/integrations/v1/formatted_webhook/[REDACTED]/heartbeat/',
    })
  })

  it('preserves span identity when credential values are already filtered', () => {
    const data = { 'http.request.header.authorization': '[Filtered]' }
    expect(scrubSpanAttributes(data)).toBe(data)
  })

  it('preserves span identity when no credential attribute is present', () => {
    const data = { 'http.method': 'GET' }

    expect(scrubSpanCredentialAttributes(data)).toBe(data)
  })

  it('preserves span identity when projected credential attributes are already filtered', () => {
    const data = {
      'http.request.header.authorization': '[Filtered]',
      'http.method': 'GET',
    }

    expect(scrubSpanCredentialAttributes(data)).toBe(data)
  })

  it('redacts projected credential attributes without replacing safe sibling references', () => {
    const safeSibling = ['GET', 'POST']
    const data = {
      'http.request.header.authorization': 'Bearer secret',
      'http.request.header.x-api-key': undefined,
      'http.request.header.user-agent': safeSibling,
    }

    const result = scrubSpanCredentialAttributes(data)

    expect(result).toEqual({
      'http.request.header.authorization': '[Filtered]',
      'http.request.header.x-api-key': '[Filtered]',
      'http.request.header.user-agent': safeSibling,
    })
    expect(result).not.toBe(data)
    expect(result['http.request.header.user-agent']).toBe(safeSibling)
    expect(data['http.request.header.authorization']).toBe('Bearer secret')
    expect(data['http.request.header.x-api-key']).toBeUndefined()
  })

  it('scrubs all event request metadata with copy-on-write semantics', () => {
    const event = Object.freeze({
      request: Object.freeze({
        url: 'https://example.com/verify?token=secret',
        query_string: 'token=secret',
        headers: Object.freeze({
          referer: 'https://example.com/reset?token=secret',
          authorization: 'Bearer secret',
        }),
        cookies: Object.freeze({ st: 'secret' }),
      }),
      breadcrumbs: Object.freeze([
        Object.freeze({ data: Object.freeze({ url: 'https://example.com/x?token=secret' }) }),
      ]),
      extra: Object.freeze({ token: 'outside-request-metadata' }),
    })

    const result = scrubSentryEvent(
      event as unknown as Parameters<typeof scrubSentryEvent>[0],
    ) as unknown as typeof event
    expect(result).toEqual({
      request: {
        url: 'https://example.com/verify',
        headers: {
          referer: 'https://example.com/reset',
          authorization: '[Filtered]',
        },
        cookies: { st: '[Filtered]' },
      },
      breadcrumbs: [{ data: { url: 'https://example.com/x' } }],
      extra: { token: 'outside-request-metadata' },
    })
    expect(event.request.headers.authorization).toBe('Bearer secret')
    expect(event.breadcrumbs[0].data.url).toContain('?token=secret')
    expect(result.extra).toBe(event.extra)
  })

  it('returns the original event when no request metadata needs scrubbing', () => {
    const event = {
      request: { url: 'https://example.com/safe', headers: { accept: 'application/json' } },
      breadcrumbs: [{ data: { 'http.method': 'GET' } }],
    }
    expect(scrubSentryEvent(event)).toBe(event)
  })

  it('composes sync, async, and null beforeSend results', async () => {
    const hint = { source: 'test' }
    const sync = composeSentryBeforeSend((event: { request?: object }, receivedHint) => {
      expect(receivedHint).toBe(hint)
      return { ...event, request: { url: '/x?token=secret' } }
    })
    const asyncHook = composeSentryBeforeSend(async (event: { request?: object }) => ({
      ...event,
      request: { headers: { authorization: 'Bearer secret' } },
    }))
    const drop = composeSentryBeforeSend(() => null)

    expect(sync({}, hint)).toEqual({ request: { url: '/x' } })
    await expect(asyncHook({}, hint)).resolves.toEqual({
      request: { headers: { authorization: '[Filtered]' } },
    })
    expect(drop({}, hint)).toBeNull()
  })

  it('preserves thrown errors and rejected promises from beforeSend', async () => {
    const thrown = new Error('sync failure')
    const rejected = new Error('async failure')
    const syncHook = composeSentryBeforeSend((_event: object, _hint: object) => {
      throw thrown
    })
    const asyncHook = composeSentryBeforeSend((_event: object, _hint: object) =>
      Promise.reject(rejected),
    )

    expect(() => syncHook({}, {})).toThrow(thrown)
    await expect(asyncHook({}, {})).rejects.toBe(rejected)
  })
})
