import { describe, expect, it } from 'vitest'
import { matchesRegisteredRedirectUri } from './registered-redirect-uri.mts'

describe('registered OAuth redirect URI matching', () => {
  it.each(['127.0.0.1', '[::1]'])('accepts an ephemeral port for port-less %s', host => {
    const registered = `http://${host}/oauth/native/windows/callback?next=%2Fhome`
    expect(
      matchesRegisteredRedirectUri(
        `http://${host}:49152/oauth/native/windows/callback?next=%2Fhome`,
        [registered],
      ),
    ).toBe(true)
    expect(matchesRegisteredRedirectUri(registered, [registered])).toBe(true)
    expect(matchesRegisteredRedirectUri(`http://${host}:0`, [`http://${host}`])).toBe(true)
    expect(matchesRegisteredRedirectUri(`http://${host}:49152?x=1`, [`http://${host}?x=1`])).toBe(
      true,
    )
    expect(matchesRegisteredRedirectUri(`http://${host}:000001`, [`http://${host}`])).toBe(true)
  })

  it.each([
    ['localhost', 'http://localhost/callback', 'http://localhost:49152/callback'],
    ['HTTPS', 'https://127.0.0.1/callback', 'https://127.0.0.1:49152/callback'],
    [
      'explicit registration port',
      'http://127.0.0.1:8000/callback',
      'http://127.0.0.1:49152/callback',
    ],
    ['different path', 'http://127.0.0.1/callback', 'http://127.0.0.1:49152/other'],
    ['different query', 'http://127.0.0.1/callback?x=1', 'http://127.0.0.1:49152/callback?x=2'],
    ['out-of-range port', 'http://127.0.0.1/callback', 'http://127.0.0.1:65536/callback'],
    ['userinfo', 'http://127.0.0.1/callback', 'http://user@127.0.0.1:49152/callback'],
    ['fragment', 'http://127.0.0.1/callback', 'http://127.0.0.1:49152/callback#fragment'],
    ['normalized path alias', 'http://127.0.0.1/callback', 'http://127.0.0.1:49152/x/../callback'],
  ])('requires exact matching for %s', (_case, registered, requested) => {
    expect(matchesRegisteredRedirectUri(requested, [registered])).toBe(false)
  })
})
