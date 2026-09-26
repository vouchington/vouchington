import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  mockPathname,
  mockPush,
  navbarUnderTest,
  setNavbarUser,
  testUser,
} from '@/test-helpers/components/navbar.mock-support'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { logout } from '@/lib/auth/logout'

import { toast } from 'sonner'

describe('Navbar user dropdown', () => {
  beforeEach(() => {
    setNavbarUser(testUser)
    mockPathname.mockReturnValue('/')
  })

  it('navigates authenticated users to preferences with Cmd+.', () => {
    mockPush.mockReset()
    render(navbarUnderTest())

    fireEvent.keyDown(window, { key: '.', metaKey: true })

    expect(mockPush).toHaveBeenCalledWith('/my/preferences')
  })

  it('does not navigate unauthenticated users to preferences with Cmd+.', () => {
    setNavbarUser(null)
    mockPush.mockReset()
    render(navbarUnderTest())

    fireEvent.keyDown(window, { key: '.', metaKey: true })

    expect(mockPush).not.toHaveBeenCalled()
  })

  it('renders Landing Pages and Referrals links in the dropdown', () => {
    render(navbarUnderTest())

    // "Landing Pages" also appears in the intent switcher dropdown.
    // Find the dropdown link by searching all elements with that text and taking the anchor.
    const allLandingPages = screen.getAllByText('Landing Pages')
    const landingPagesLink = allLandingPages.map(el => el.closest('a')).find(el => el !== null)
    expect(landingPagesLink).not.toBeNull()
    expect(landingPagesLink!.getAttribute('href')).toBe('/my/landing-pages')

    const referralsLink = screen.getByText('Referrals').closest('a')
    expect(referralsLink).not.toBeNull()
    expect(referralsLink!.getAttribute('href')).toBe('/my/referrals')
  })

  it('renders Profile, Identity, Preferences links in the dropdown', () => {
    render(navbarUnderTest())

    expect(screen.getByText('Profile').closest('a')?.getAttribute('href')).toBe('/my/profile')
    expect(screen.getByText('Identity').closest('a')?.getAttribute('href')).toBe('/my/identity')
    expect(screen.getByText('Preferences').closest('a')?.getAttribute('href')).toBe(
      '/my/preferences',
    )
  })

  it('does not show dropdown for unauthenticated users', () => {
    setNavbarUser(null)
    render(navbarUnderTest())
    expect(screen.queryByText('Profile')).toBeNull()
  })

  it('renders the authenticated write control without outline border styling', () => {
    render(navbarUnderTest())

    const writeButton = screen.getByRole('button', { name: 'Write' })
    expect(writeButton.className).toContain('hover:bg-accent')
    expect(writeButton.className).not.toContain('border')
    expect(writeButton.className).not.toContain('border-input')
    expect(writeButton.className).not.toContain('shadow-sm')
  })

  it('opens the write dialog from the authenticated write control', () => {
    render(navbarUnderTest())

    expect(screen.getByTestId('write-dialog')).toHaveAttribute('data-open', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Write' }))

    expect(screen.getByTestId('write-dialog')).toHaveAttribute('data-open', 'true')
  })

  it('omits the Sign In control on the login page', () => {
    setNavbarUser(null)
    mockPathname.mockReturnValue('/login')

    render(navbarUnderTest())

    expect(screen.queryByRole('link', { name: 'Sign In' })).toBeNull()
    expect(screen.queryByText('Sign In')).toBeNull()
  })

  it('links unauthenticated users to login away from the login page', () => {
    setNavbarUser(null)
    mockPathname.mockReturnValue('/')

    render(navbarUnderTest())

    expect(screen.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/login')
  })

  it('shows a toast when logout fails', async () => {
    vi.mocked(logout).mockRejectedValueOnce(new Error('Failed from API'))

    render(navbarUnderTest())

    fireEvent.click(screen.getByText('Sign out'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to log out')
    })
  })
})
