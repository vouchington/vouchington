import { beforeEach, describe, expect, it } from 'vitest'

import {
  mockPathname,
  mockPush,
  navbarUnderTest,
  setNavbarUser,
  testUser,
} from '@/test-helpers/components/navbar.mock-support'

import { fireEvent, render, screen } from '@testing-library/react'

import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { seedMessages } from '@/lib/i18n/use-translations'

import { esMessages } from '@ts-shared/ui-messages/locale-catalogs'

describe('Navbar sidebar trigger visibility', () => {
  beforeEach(() => {
    setNavbarUser(null)
    mockPathname.mockReturnValue('/')
  })

  it('animates the trigger slot closed at desktop viewports when sidebar is expanded', () => {
    const { container } = render(navbarUnderTest())
    const trigger = container.querySelector('[data-pw="sidebar-trigger"]')
    const triggerSlot = trigger?.parentElement
    // Visibility is CSS-driven via group-data selectors on the sidebar wrapper's data-state
    // attribute — no mounted/isMobile flags, so there is no SSR/hydration flip.
    // At >=md viewports with data-state="expanded", the slot animates to width 0 so the Voucha
    // logo moves horizontally instead of jumping. has-[:focus-visible] restores space when tabbing.
    expect(triggerSlot?.className).toContain('transition-[width,margin-right]')
    expect(triggerSlot?.className).toContain('duration-300')
    expect(triggerSlot?.className).toContain('md:group-data-[state=expanded]/sidebar-wrapper:w-0')
    expect(triggerSlot?.className).toContain('md:group-data-[state=expanded]/sidebar-wrapper:mr-0')
    expect(triggerSlot?.className).toContain(
      'md:group-data-[state=expanded]/sidebar-wrapper:has-[:focus-visible]:w-11',
    )
    expect(triggerSlot?.className).toContain(
      'md:group-data-[state=expanded]/sidebar-wrapper:has-[:focus-visible]:mr-2',
    )
    // Must not use hidden/invisible/opacity-0 which either remove from a11y tree or preserve space
    expect(triggerSlot?.className).not.toMatch(/(?:^|\s)hidden(?:\s|$)/)
    expect(trigger?.className).not.toContain('sr-only')
    expect(trigger?.className).not.toContain('invisible')
    expect(trigger?.className).not.toContain('opacity-0')
    expect(trigger?.getAttribute('tabindex')).toBeNull()
    expect(trigger?.getAttribute('aria-hidden')).toBeNull()
  })
})

describe('Navbar layout', () => {
  beforeEach(() => {
    setNavbarUser(null)
    mockPathname.mockReturnValue('/')
  })

  it('inner nav wrapper is centered to content column via mx-auto max-w-[1200px]', () => {
    const { container } = render(navbarUnderTest())
    // The outer <nav> has px-* padding; the inner flex row must be mx-auto max-w-[1200px]
    // so the SidebarTrigger aligns with the 1200px content column on wide viewports.
    const nav = container.querySelector('nav[aria-label="Main"]')
    const inner = nav?.firstElementChild
    expect(inner?.className).toContain('mx-auto')
    expect(inner?.className).toContain('max-w-[1200px]')
    expect(inner?.className).toContain('w-full')
  })

  it('keeps the search label visible at mobile and desktop breakpoints', () => {
    render(navbarUnderTest())

    const searchButton = screen.getByRole('button', { name: 'Open search' })
    expect(searchButton.textContent).toContain('Search...')

    const searchLabel = screen.getByText('Search...')
    expect(searchLabel.className).toContain('truncate')
    expect(searchLabel.className).not.toContain('hidden')
    expect(searchLabel.className).not.toContain('sm:inline')
  })

  it('uses a touch-safe search hit target with a compact visual shell', () => {
    const { container } = render(navbarUnderTest())

    const searchButton = screen.getByRole('button', { name: 'Open search' })
    expect(searchButton.className).toContain('h-11')
    expect(searchButton.className).toContain('sm:h-8')

    const searchShell = container.querySelector('[data-pw="navbar-search-shell"]')
    expect(searchShell?.className).toContain('h-8')
    expect(searchShell?.className).toContain('border')
  })

  it('opens search from the topbar search control', () => {
    render(navbarUnderTest())

    expect(screen.getByTestId('command-search')).toHaveAttribute('data-open', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Open search' }))

    expect(screen.getByTestId('command-search')).toHaveAttribute('data-open', 'true')
  })

  it('renders topbar chrome from the resolved non-English UI locale catalog', () => {
    setNavbarUser(testUser)
    seedMessages('es', esMessages)

    render(<UiLocaleProvider uiLocale='es'>{navbarUnderTest()}</UiLocaleProvider>)

    expect(screen.getByRole('button', { name: 'Abrir búsqueda' })).toBeInTheDocument()
    expect(screen.getByText('Buscar...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Escribir' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open search' })).toBeNull()
    expect(screen.queryByText('Search...')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Write' })).toBeNull()
  })
})
