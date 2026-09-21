import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SidebarSiteFooter } from '../sidebar-site-footer'

describe('SidebarSiteFooter', () => {
  it('contains representative site and content links', () => {
    render(<SidebarSiteFooter />)

    const footer = screen.getByRole('contentinfo')
    expect(footer).toContainElement(screen.getByRole('link', { name: 'About' }))
    expect(footer).toContainElement(screen.getByRole('link', { name: 'Copyright' }))
    expect(footer).toContainElement(screen.getByRole('link', { name: 'Stories' }))
  })

  it('links support to the public support email address', () => {
    render(<SidebarSiteFooter />)

    expect(screen.getByRole('link', { name: 'Support' })).toHaveAttribute(
      'href',
      'mailto:support@voucha.ai',
    )
  })
})
