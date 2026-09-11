import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExternalLink } from '@/components/ui/external-link'

describe('ExternalLink', () => {
  it('renders as anchor with correct attributes for https url', () => {
    render(<ExternalLink href='https://example.com'>Link</ExternalLink>)
    const link = screen.getByRole('link', { name: 'Link' })
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'nofollow noopener noreferrer')
    expect(link).toHaveAttribute('data-pw', 'external-link')
  })

  it('renders as anchor for http url', () => {
    render(<ExternalLink href='http://example.com'>Link</ExternalLink>)
    expect(screen.getByRole('link', { name: 'Link' })).toBeInTheDocument()
  })

  it('renders as span for unsafe protocol', () => {
    render(<ExternalLink href='javascript:alert(1)'>Unsafe</ExternalLink>)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    const span = screen.getByText('Unsafe')
    expect(span.tagName).toBe('SPAN')
  })

  it('renders as span for non-http/https scheme (e.g. ftp)', () => {
    render(<ExternalLink href='ftp://example.com'>FTP</ExternalLink>)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('FTP').tagName).toBe('SPAN')
  })

  it('renders as anchor for protocol-relative url (resolved as https)', () => {
    render(<ExternalLink href='//example.com'>Relative</ExternalLink>)
    expect(screen.getByRole('link')).toBeInTheDocument()
  })

  it('adds ugc to rel when ugc prop set', () => {
    render(
      <ExternalLink
        href='https://example.com'
        ugc
      >
        UGC Link
      </ExternalLink>,
    )
    expect(screen.getByRole('link')).toHaveAttribute('rel', 'nofollow ugc noopener noreferrer')
  })

  it('respects custom rel override', () => {
    render(
      <ExternalLink
        href='https://example.com'
        rel='noopener'
      >
        Custom
      </ExternalLink>,
    )
    expect(screen.getByRole('link')).toHaveAttribute('rel', 'noopener')
  })

  it('merges className', () => {
    render(
      <ExternalLink
        href='https://example.com'
        className='text-blue-600'
      >
        Link
      </ExternalLink>,
    )
    expect(screen.getByRole('link')).toHaveClass('text-blue-600')
  })
})
