import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SidebarSiteFooter } from '../sidebar-site-footer'

const proofNow = new Date(process.env.VOUCH_PROOF_NOW ?? '2026-10-31T12:00:00.000Z')

describe('SidebarSiteFooter', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('contains representative site and content links', () => {
    vi.useFakeTimers()
    vi.setSystemTime(proofNow)
    render(<SidebarSiteFooter />)

    const footer = screen.getByRole('contentinfo')
    expect(footer).toContainElement(screen.getByRole('link', { name: 'About' }))
    expect(footer).toContainElement(screen.getByRole('link', { name: 'Copyright' }))
    expect(footer).toContainElement(screen.getByRole('link', { name: 'Stories' }))
    expect(footer).toHaveTextContent(`${proofNow.getFullYear()} Voucha`)
  })

  it('links support to the public support email address', () => {
    render(<SidebarSiteFooter />)

    expect(screen.getByRole('link', { name: 'Support' })).toHaveAttribute(
      'href',
      'mailto:support@voucha.ai',
    )
  })
})
