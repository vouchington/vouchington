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
})
