import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import { ShareLandingPageBanner } from '../share-landing-page-banner'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: ReactNode
        href: string
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

describe('ShareLandingPageBanner', () => {
  it('renders the landing page URL and action buttons', () => {
    render(<ShareLandingPageBanner username='testuser' />)

    expect(screen.getByText('Share your page:')).toBeInTheDocument()
    expect(screen.getByText('/@testuser')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /edit/i })).toBeInTheDocument()
  })

  it('exposes the banner as a region landmark with a label (AGENTS.md ARIA banner rule)', () => {
    render(<ShareLandingPageBanner username='testuser' />)

    expect(screen.getByRole('region', { name: /share your landing page/i })).toBeInTheDocument()
  })

  it('marks the share link for referral attribution', () => {
    render(<ShareLandingPageBanner username='testuser' />)

    const link = screen.getByText('/@testuser')
    expect(link.getAttribute('href')).toBe('/@testuser?referrer=testuser')
  })

  it('links the edit button to /my/landing-pages', () => {
    render(<ShareLandingPageBanner username='testuser' />)

    const editLink = screen.getByRole('link', { name: /edit/i })
    expect(editLink.getAttribute('href')).toBe('/my/landing-pages')
  })

  it('copies a share URL with the referral marker and UTM parameters', async () => {
    const writeText = vi.fn<Clipboard['writeText']>().mockResolvedValue(undefined)
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })

    try {
      render(<ShareLandingPageBanner username='testuser' />)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /copy/i }))
      })

      expect(writeText).toHaveBeenCalledOnce()
      const copiedUrl = new URL(writeText.mock.calls[0]![0])
      expect(copiedUrl.origin).toBe(window.location.origin)
      expect(copiedUrl.pathname).toBe('/@testuser')
      expect(copiedUrl.searchParams.get('utm_source')).toBe('voucha')
      expect(copiedUrl.searchParams.get('utm_medium')).toBe('share')
      expect(copiedUrl.searchParams.get('referrer')).toBe('testuser')
    } finally {
      if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
      else Reflect.deleteProperty(navigator, 'clipboard')
    }
  })
})
