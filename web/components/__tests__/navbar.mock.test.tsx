import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  mockPathname,
  navbarUnderTest,
  setNavbarUser,
  testUser,
} from '@/test-helpers/components/navbar.mock-support'

import { fireEvent, render, screen } from '@testing-library/react'

import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { mergeMessages } from '@/lib/i18n/use-translations'

import { esMessages } from '@ts-shared/test-helpers/locale-catalogs.mts'

import { Navbar as NavbarComponent } from '../navbar'

vi.mock(import('@/components/keyboard-shortcuts-dialog'), () => ({
  KeyboardShortcutsDialog: () => <div data-pw='keyboard-shortcuts-dialog' />,
}))

describe('Navbar sidebar trigger visibility', () => {
  beforeEach(() => {
    setNavbarUser(null)
    mockPathname.mockReturnValue('/')
  })

  it('keeps the sidebar trigger reachable by keyboard and assistive tech', () => {
    const { container } = render(navbarUnderTest(NavbarComponent))
    const trigger = container.querySelector('[data-pw="sidebar-trigger"]')
    // The trigger stays in the accessibility tree and keyboard order at every viewport.
    expect(trigger?.getAttribute('tabindex')).toBeNull()
    expect(trigger?.getAttribute('aria-hidden')).toBeNull()
  })
})

const searchButtonName = /Search\.\.\. (?:⌘|Ctrl) K, Open search/
const spanishSearchButtonName = /Buscar\.\.\. (?:⌘|Ctrl) K, Abrir búsqueda/

describe('Navbar layout', () => {
  beforeEach(() => {
    setNavbarUser(null)
    mockPathname.mockReturnValue('/')
  })

  it('keeps the search label visible at mobile and desktop breakpoints', () => {
    render(navbarUnderTest(NavbarComponent))

    const searchButton = screen.getByRole('button', { name: searchButtonName })
    expect(searchButton.textContent).toContain('Search...')

    const searchLabel = screen.getByText('Search...')
    expect(searchLabel).toBeVisible()
  })

  it('uses a touch-safe search hit target with a compact visual shell', () => {
    const { container } = render(navbarUnderTest(NavbarComponent))

    const searchButton = screen.getByRole('button', { name: searchButtonName })
    expect(searchButton).toBeVisible()
  })

  it('opens search from the topbar search control', () => {
    render(navbarUnderTest(NavbarComponent))

    expect(screen.getByTestId('command-search')).toHaveAttribute('data-open', 'false')

    fireEvent.click(screen.getByRole('button', { name: searchButtonName }))

    expect(screen.getByTestId('command-search')).toHaveAttribute('data-open', 'true')
  })

  it('renders topbar chrome from the resolved non-English UI locale catalog', () => {
    setNavbarUser(testUser)
    mergeMessages('es', esMessages)

    render(<UiLocaleProvider uiLocale='es'>{navbarUnderTest(NavbarComponent)}</UiLocaleProvider>)

    expect(screen.getByRole('button', { name: spanishSearchButtonName })).toBeInTheDocument()
    expect(screen.getByText('Buscar...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Escribir' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open search' })).toBeNull()
    expect(screen.queryByText('Search...')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Write' })).toBeNull()
  })
})
