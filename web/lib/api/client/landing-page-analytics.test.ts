import { beforeEach, describe, expect, it, vi } from 'vitest'
import { trackLandingPageClick, trackLandingPageVisit } from './landing-page-analytics'

describe('landing-page analytics client', () => {
  const sendBeacon = vi.fn<(url: string, data?: BodyInit | null) => boolean>(() => true)

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    })
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      value: undefined,
    })
  })

  it('sends visit and click beacons when Global Privacy Control is inactive', () => {
    trackLandingPageVisit('page-1', { utm_source: 'social' })
    trackLandingPageClick('page-1', { landing_page_item_id: 'item-1' })

    expect(sendBeacon).toHaveBeenCalledTimes(2)
    expect(sendBeacon).toHaveBeenCalledWith('/api/v1/landing-pages/page-1/visits', expect.any(Blob))
    expect(sendBeacon).toHaveBeenCalledWith('/api/v1/landing-pages/page-1/clicks', expect.any(Blob))
  })

  it('does not send visit or click beacons when Global Privacy Control is active', () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      value: true,
    })

    trackLandingPageVisit('page-1', { utm_source: 'social' })
    trackLandingPageClick('page-1', { landing_page_item_id: 'item-1' })

    expect(sendBeacon).not.toHaveBeenCalled()
  })
})
