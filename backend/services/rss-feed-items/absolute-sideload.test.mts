import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { TEST_SIDELOAD_SIGNING_KEY } from '@ts-shared/url-signing/test-key'
import { signPath } from '@ts-shared/url-signing'
import {
  sanitizeRssFeedItemContentHtml,
  sanitizeRssFeedItemContentHtmlBatch,
} from './sanitize-content-html.mts'

describe('RSS sanitizer absolute sideload URLs', () => {
  beforeAll(() => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com/')
    vi.stubEnv('VOUCHA_SIDELOAD_SIGNING_KEYS', TEST_SIDELOAD_SIGNING_KEY)
  })

  afterAll(() => vi.unstubAllEnvs())

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
