import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { KeyboardShortcutsDialog } from '../keyboard-shortcuts-dialog'
import { MODERATION_QUEUE_SHORTCUTS } from '@/lib/keyboard-shortcuts'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        onClick,
        prefetch: _prefetch,
        ...props
      }: {
        children: ReactNode
        href: string
        onClick?: () => void
        prefetch?: boolean
        [k: string]: unknown
      }) => (
        <a
          href={href}
          onClick={onClick}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

function renderDialog(open: boolean) {
  return render(
    <KeyboardShortcutsDialog
      open={open}
      onOpenChange={vi.fn<VitestLooseMock>()}
    />,
  )
}

describe('KeyboardShortcutsDialog', () => {
  it('renders dialog title when open', () => {
    renderDialog(true)
    expect(screen.getByRole('heading', { name: /keyboard shortcuts/i })).toBeDefined()
  })

  it('renders Navigation category', () => {
    renderDialog(true)
    expect(screen.getByText('Navigation')).toBeDefined()
  })

  it('renders General category', () => {
    renderDialog(true)
    expect(screen.getByText('General')).toBeDefined()
  })

  it('renders all shortcut descriptions', () => {
    renderDialog(true)
    expect(screen.getByText('Open the global search dialog')).toBeDefined()
    expect(screen.getByText('Expand or collapse the sidebar')).toBeDefined()
    expect(screen.getByText('Go to preferences (signed-in users)')).toBeDefined()
    expect(screen.getByText('Open this keyboard shortcuts dialog')).toBeDefined()
  })

  it('contains link to /article/keyboard-shortcuts', () => {
    renderDialog(true)
    const link = screen.getByRole('link', { name: /view all shortcuts/i })
    expect(link.getAttribute('href')).toBe('/article/keyboard-shortcuts')
  })

  it('does not render content when closed', () => {
    renderDialog(false)
    expect(screen.queryByRole('heading', { name: /keyboard shortcuts/i })).toBeNull()
  })

  it('renders scoped shortcut lists without the all-shortcuts link', () => {
    render(
      <KeyboardShortcutsDialog
        open
        onOpenChange={vi.fn<VitestLooseMock>()}
        shortcuts={MODERATION_QUEUE_SHORTCUTS}
        title='Moderation Shortcuts'
        description='Queue-specific shortcuts.'
        viewAllLink={false}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Moderation Shortcuts' })).toBeDefined()
    expect(screen.getByText('Move to the next moderation queue item')).toBeDefined()
    expect(screen.queryByRole('link', { name: /view all shortcuts/i })).toBeNull()
  })
})
