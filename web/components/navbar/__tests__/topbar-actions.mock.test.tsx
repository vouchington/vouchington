import { configure, render, screen } from '@testing-library/react'
import { createTranslator, type MessageKey } from '@ts-shared/ui-messages'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NavbarSearchButton } from '../topbar-actions'

configure({ testIdAttribute: 'data-pw' })

// NavbarSearchButton calls useTranslations(), which suspends on the live catalog fetch.
// Resolve keys against the committed English catalog so the rendered keycap text stays tied
// to that copy.
let translate!: (key: MessageKey, params?: Record<string, unknown>) => string

vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => translate,
}))

describe('NavbarSearchButton shortcut chips', () => {
  beforeEach(() => {
    translate = createTranslator('en', enMessages)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders Ctrl and K as separate keycaps on non-Mac', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    )
    render(<NavbarSearchButton onOpenSearch={() => undefined} />)
    expect(screen.getAllByTestId('kbd').map(chip => chip.textContent)).toEqual(['Ctrl', 'K'])
    expect(screen.getByTestId('navbar-search-button').textContent?.replace(/\s+/g, ' ')).toContain(
      'Ctrl K',
    )
    expect(screen.getByTestId('navbar-search-button')).toHaveAttribute(
      'aria-label',
      'Search... Ctrl K, Open search',
    )
  })

  it('renders the command symbol and K as separate keycaps on Mac', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    )
    render(<NavbarSearchButton onOpenSearch={() => undefined} />)
    expect(screen.getAllByTestId('kbd').map(chip => chip.textContent)).toEqual(['⌘', 'K'])
    expect(screen.getByTestId('navbar-search-button').textContent?.replace(/\s+/g, ' ')).toContain(
      '⌘ K',
    )
    expect(screen.getByTestId('navbar-search-button')).toHaveAttribute(
      'aria-label',
      'Search... ⌘ K, Open search',
    )
  })
})
