import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { TEST_SIDELOAD_SIGNING_KEY } from '@ts-shared/url-signing/test-key'
import { signPath } from '@vouchington/utils/url-signing'

type SanitizeRssFeedItemContentHtml =
  (typeof import('./sanitize-content-html.mts'))['sanitizeRssFeedItemContentHtml']
type SanitizeRssFeedItemContentHtmlBatch =
  (typeof import('./sanitize-content-html.mts'))['sanitizeRssFeedItemContentHtmlBatch']

let sanitizeRssFeedItemContentHtml: SanitizeRssFeedItemContentHtml
let sanitizeRssFeedItemContentHtmlBatch: SanitizeRssFeedItemContentHtmlBatch

describe('RSS sanitizer absolute sideload URLs', () => {
  beforeAll(async () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com/')
    vi.stubEnv('VOUCHA_SIDELOAD_SIGNING_KEYS', TEST_SIDELOAD_SIGNING_KEY)
    vi.resetModules()
    const sanitizer = await import('./sanitize-content-html.mts')
    sanitizeRssFeedItemContentHtml = sanitizer.sanitizeRssFeedItemContentHtml
    sanitizeRssFeedItemContentHtmlBatch = sanitizer.sanitizeRssFeedItemContentHtmlBatch
  })

  afterAll(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('emits an absolute signed sideload URL for a single item', async () => {
    const html = await sanitizeRssFeedItemContentHtml({
      link: 'https://example.com/article',
      guid: 'single',
      content: '<img src="https://source.example/image.jpg">',
    })
    assertAbsoluteSignedSideload(html)
  })

  it('emits absolute signed sideload URLs for a batch', async () => {
    const result = await sanitizeRssFeedItemContentHtmlBatch([
      {
        id: 'batch',
        data: {
          link: 'https://example.com/article',
          guid: 'batch',
          content: '<img src="https://source.example/batch.jpg">',
        },
      },
    ])
    assertAbsoluteSignedSideload(result.batch)
  })
})

function assertAbsoluteSignedSideload(html: string | null | undefined): void {
  const src = html?.match(/src="([^"]+)"/)?.[1]
  expect(src).toBeDefined()
  const url = new URL(src!.replaceAll('&amp;', '&'))
  expect(url.origin).toBe('https://images.example.com')
  expect(url.pathname).toMatch(/^\/sideload\//)
  expect(url.searchParams.get('sig')).toBe(signPath(url.pathname, [TEST_SIDELOAD_SIGNING_KEY]))
}
