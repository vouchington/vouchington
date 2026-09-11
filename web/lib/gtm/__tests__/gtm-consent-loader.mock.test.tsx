import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GtmConsentLoader } from '../gtm-consent-loader'
import { GTM_ORIGIN } from '../gtm-origin'

let mockPathname = '/stories'

vi.mock(import('next/navigation'), () => ({
  usePathname: () => mockPathname,
}))

describe('GtmConsentLoader', () => {
  beforeEach(() => {
    mockPathname = '/stories'
    localStorage.clear()
    Object.defineProperty(window.navigator, 'globalPrivacyControl', {
      configurable: true,
      value: false,
    })
    delete window.dataLayer
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      value: undefined,
    })
    document.head.querySelectorAll('script').forEach(script => script.remove())
  })

  it('does not load GTM when the id is invalid', () => {
    localStorage.setItem('cookie-consent', 'all')
    const addEventListener = vi.spyOn(window, 'addEventListener')

    render(<GtmConsentLoader gtmId='invalid-id' />)

    expect(document.head.querySelector('script')).toBeNull()
    expect(window.dataLayer).toBeUndefined()
    expect(addEventListener).not.toHaveBeenCalledWith(
      'cookie-consent-changed',
      expect.any(Function),
    )
  })

  it('does not load GTM before analytics consent', () => {
    render(<GtmConsentLoader gtmId='GTM-ABC123' />)

    expect(document.head.querySelector('script')).toBeNull()
    expect(document.body.querySelector('noscript')).toBeNull()
    expect(document.body.querySelector('script')).toBeNull()
    expect(window.dataLayer).toBeUndefined()
  })

  it('does not load GTM for essential-only consent', () => {
    localStorage.setItem('cookie-consent', 'essential')

    render(<GtmConsentLoader gtmId='GTM-ABC123' />)

    expect(document.head.querySelector('script')).toBeNull()
    expect(window.dataLayer).toBeUndefined()
  })

  it('does not load GTM when Global Privacy Control is enabled', () => {
    Object.defineProperty(window.navigator, 'globalPrivacyControl', {
      configurable: true,
      value: true,
    })
    localStorage.setItem('cookie-consent', 'all')

    render(<GtmConsentLoader gtmId='GTM-ABC123' />)

    expect(document.head.querySelector('script')).toBeNull()
    expect(window.dataLayer).toBeUndefined()
  })

  it('loads GTM after existing all-cookie consent without rendering raw React scripts', async () => {
    localStorage.setItem('cookie-consent', 'all')

    const { container } = render(
      <GtmConsentLoader
        gtmId='GTM-EXISTING123'
        nonce='nonce-123'
      />,
    )

    await waitFor(() => {
      expect(document.head.querySelector('script')?.src).toBe(
        `${GTM_ORIGIN}/gtm.js?id=GTM-EXISTING123`,
      )
    })
    expect(document.head.querySelector('script')?.nonce).toBe('nonce-123')
    expect(container.querySelector('script,noscript')).toBeNull()
    expect(document.body.querySelector('noscript')).toBeNull()
    expect(document.body.querySelector('script')).toBeNull()
    expect(window.dataLayer).toContainEqual(expect.objectContaining({ event: 'gtm.js' }))
    expect(window.dataLayer).toContainEqual({ event: 'page_view', page_path: '/stories' })
  })

  it('loads GTM when consent changes to all cookies', async () => {
    render(<GtmConsentLoader gtmId='GTM-CHANGED123' />)

    localStorage.setItem('cookie-consent', 'all')
    window.dispatchEvent(new CustomEvent('cookie-consent-changed'))

    await waitFor(() => {
      expect(document.head.querySelector('script')?.src).toBe(
        `${GTM_ORIGIN}/gtm.js?id=GTM-CHANGED123`,
      )
    })
    expect(window.dataLayer).toContainEqual(expect.objectContaining({ event: 'gtm.js' }))
    expect(window.dataLayer).toContainEqual({ event: 'page_view', page_path: '/stories' })
  })

  it('does not load GTM when Global Privacy Control is active despite all-cookie consent', () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      value: true,
    })
    localStorage.setItem('cookie-consent', 'all')

    render(<GtmConsentLoader gtmId='GTM-GPC123' />)

    expect(document.head.querySelector('script')).toBeNull()
    expect(window.dataLayer).toBeUndefined()
  })

  it('does not load GTM when consent changes while Global Privacy Control is active', () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      value: true,
    })
    render(<GtmConsentLoader gtmId='GTM-GPCCHANGE123' />)

    localStorage.setItem('cookie-consent', 'all')
    window.dispatchEvent(new CustomEvent('cookie-consent-changed'))

    expect(document.head.querySelector('script')).toBeNull()
    expect(window.dataLayer).toBeUndefined()
  })
})
