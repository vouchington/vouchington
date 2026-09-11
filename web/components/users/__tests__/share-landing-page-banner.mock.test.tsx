import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

  it('exposes the banner as a region landmark with a label (CLAUDE.md ARIA banner rule)', () => {
    render(<ShareLandingPageBanner username='testuser' />)

    expect(screen.getByRole('region', { name: /share your landing page/i })).toBeInTheDocument()
  })

  it('links the landing page URL to /@username', () => {
    render(<ShareLandingPageBanner username='testuser' />)

    const link = screen.getByText('/@testuser')
    expect(link.getAttribute('href')).toBe('/@testuser')
  })

  it('links the edit button to /my/landing-pages', () => {
    render(<ShareLandingPageBanner username='testuser' />)

    const editLink = screen.getByRole('link', { name: /edit/i })
    expect(editLink.getAttribute('href')).toBe('/my/landing-pages')
  })

  it('copies the full URL to clipboard on copy click', async () => {
    const writeText = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(<ShareLandingPageBanner username='testuser' />)

    fireEvent.click(screen.getByRole('button', { name: /copy/i }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/@testuser'))
    })
  })
})
