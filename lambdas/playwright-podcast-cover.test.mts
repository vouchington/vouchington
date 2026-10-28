import { describe, expect, it } from 'vitest'

import {
  isPlaywrightPodcastCoverRequest,
  PLAYWRIGHT_PODCAST_COVER,
} from './playwright-podcast-cover.mts'

const PLAYWRIGHT_PODCAST_COVER_URL = 'https://playwright.invalid/podcast-cover.png'

describe('Playwright podcast cover fixture', () => {
  it('matches only the reserved sideload source URL', () => {
    const encoded = Buffer.from(PLAYWRIGHT_PODCAST_COVER_URL).toString('base64url')
    expect(isPlaywrightPodcastCoverRequest(`/sideload/v2/${encoded}`)).toBe(true)
    expect(isPlaywrightPodcastCoverRequest('/sideload/not-the-fixture')).toBe(false)
    expect(isPlaywrightPodcastCoverRequest('/images/podcast-cover.png')).toBe(false)
  })

  it('contains a PNG payload', () => {
    expect(PLAYWRIGHT_PODCAST_COVER.subarray(1, 4).toString('ascii')).toBe('PNG')
  })
})
