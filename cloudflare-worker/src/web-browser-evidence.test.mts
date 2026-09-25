import { describe, expect, it } from 'vitest'
import { hasBrowserFetchMetadata, isWebBrowserRequest } from './web-browser-evidence.mts'

const requestOrigin = 'https://voucha.ai'

type Case = [name: string, method: string, headers: Record<string, string>]

const navigation = { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' }
const download = { 'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'navigate' }

const webCases: Case[] = [
  [
    'same-origin GET with a same-origin Referer',
    'GET',
    { 'sec-fetch-site': 'same-origin', referer: 'https://voucha.ai/topics/x' },
  ],
  [
    'same-origin POST with the request Origin',
    'POST',
    { 'sec-fetch-site': 'same-origin', origin: requestOrigin },
  ],
  ['same-origin POST without Origin', 'POST', { 'sec-fetch-site': 'same-origin' }],
  [
    'same-origin POST under a no-referrer policy',
    'POST',
    { 'sec-fetch-site': 'same-origin', origin: 'null' },
  ],
  [
    'same-origin beacon',
    'POST',
    {
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'no-cors',
      'sec-fetch-site': 'same-origin',
      origin: requestOrigin,
    },
  ],
  [
    'same-origin EventSource without Origin',
    'GET',
    { 'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'cors', 'sec-fetch-site': 'same-origin' },
  ],
  ['same-origin download link', 'GET', { ...download, 'sec-fetch-site': 'same-origin' }],
  [
    'Origin with the default HTTPS port',
    'POST',
    { 'sec-fetch-site': 'same-origin', origin: 'https://voucha.ai:443' },
  ],
  [
    'Referer with a path, query, and fragment',
    'GET',
    { 'sec-fetch-site': 'same-origin', referer: 'https://voucha.ai/p/1?tab=replies#top' },
  ],
  [
    'mixed-case Fetch Metadata and method',
    'post',
    { 'sec-fetch-site': 'Same-Origin', origin: 'HTTPS://VOUCHA.AI' },
  ],
  [
    'cross-site navigation such as an OAuth callback',
    'GET',
    { ...navigation, 'sec-fetch-site': 'cross-site', referer: 'https://accounts.example/' },
  ],
  ['typed-URL navigation', 'GET', { ...navigation, 'sec-fetch-site': 'none' }],
  ['HEAD navigation', 'HEAD', { ...navigation, 'sec-fetch-site': 'same-origin' }],
]

const nonWebCases: Case[] = [
  [
    'cross-site fetch',
    'GET',
    { 'sec-fetch-mode': 'cors', 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
  ],
  ['same-site GET without Origin or Referer', 'GET', { 'sec-fetch-site': 'same-site' }],
  [
    'same-site request from a sibling host',
    'GET',
    { 'sec-fetch-site': 'same-site', origin: 'https://staging.voucha.ai' },
  ],
  ['foreign Origin', 'POST', { 'sec-fetch-site': 'same-origin', origin: 'https://evil.example' }],
  [
    'Origin with a different scheme',
    'POST',
    { 'sec-fetch-site': 'same-origin', origin: 'http://voucha.ai' },
  ],
  ['unparseable Origin', 'GET', { 'sec-fetch-site': 'same-origin', origin: 'not a url' }],
  [
    'foreign Referer',
    'GET',
    { 'sec-fetch-site': 'same-origin', referer: 'https://evil.example/x' },
  ],
  ['unparseable Referer', 'GET', { 'sec-fetch-site': 'same-origin', referer: 'not a url' }],
  ['typed-URL fetch that is not a navigation', 'GET', { 'sec-fetch-site': 'none' }],
  ['cross-site download link', 'GET', { ...download, 'sec-fetch-site': 'cross-site' }],
  ['cross-site POST navigation', 'POST', { ...navigation, 'sec-fetch-site': 'cross-site' }],
  [
    'cross-site iframe navigation',
    'GET',
    { 'sec-fetch-dest': 'iframe', 'sec-fetch-mode': 'navigate', 'sec-fetch-site': 'cross-site' },
  ],
  ['Sec-Fetch-Mode without Sec-Fetch-Site', 'GET', { 'sec-fetch-mode': 'cors' }],
]

describe('isWebBrowserRequest', () => {
  it.each(webCases)('accepts %s', (_name, method, headers) => {
    expect(isWebBrowserRequest(new Headers(headers), { method, requestOrigin })).toBe(true)
  })

  it.each(nonWebCases)('rejects %s', (_name, method, headers) => {
    expect(isWebBrowserRequest(new Headers(headers), { method, requestOrigin })).toBe(false)
  })
})

describe('hasBrowserFetchMetadata', () => {
  it.each(['sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest'])('detects %s', name => {
    expect(hasBrowserFetchMetadata(new Headers({ [name]: 'x' }))).toBe(true)
  })

  it('ignores requests without Fetch Metadata', () => {
    expect(hasBrowserFetchMetadata(new Headers({ origin: requestOrigin }))).toBe(false)
  })
})
