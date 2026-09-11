import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ViewModeDropdown } from './view-mode-dropdown'

vi.mock(
  import('@/components/ui/dropdown-menu'),
  () =>
    ({
      DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuTrigger: ({ children }: { children: ReactNode; asChild?: boolean }) => children,
      DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuItem: ({
        children,
        onSelect,
        'data-pw': dataPw,
      }: {
        children: ReactNode
        onSelect?: () => void
        'data-pw'?: string
      }) => (
        <button
          type='button'
          data-pw={dataPw}
          onClick={onSelect}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/dropdown-menu'),
)

describe('ViewModeDropdown', () => {
  it('includes the active view in the trigger accessible name', () => {
    const { container } = render(
      <ViewModeDropdown
        value='card'
        onValueChange={vi.fn<(value: 'card' | 'compact') => void>()}
        options={[
          { label: 'Card', value: 'card', icon: 'card', dataPw: 'post-view-toggle-card' },
          {
            label: 'Compact',
            value: 'compact',
            icon: 'compact',
            dataPw: 'post-view-toggle-compact',
          },
        ]}
      />,
    )

    expect(screen.getByRole('button', { name: 'View: Card' })).toBeDefined()
    expect(container.querySelector('[data-pw="post-view-toggle-card"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="post-view-toggle-compact"]')).not.toBeNull()
  })

  it('trigger button does not have visible mode label text', () => {
    render(
      <ViewModeDropdown
        value='card'
        onValueChange={vi.fn<(value: 'card' | 'compact') => void>()}
        options={[
          { label: 'Card', value: 'card', icon: 'card', dataPw: 'post-view-toggle-card' },
          {
            label: 'Compact',
            value: 'compact',
            icon: 'compact',
            dataPw: 'post-view-toggle-compact',
          },
        ]}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'View: Card' })
    // The sr-only span carries the label
    const srSpan = trigger.querySelector('.sr-only')
    expect(srSpan).not.toBeNull()
    expect(srSpan!.textContent).toBe('Card')
    // No non-sr-only child of the trigger renders 'Card' as visible text
    const visibleTriggerText = [...trigger.childNodes].reduce(
      (acc, n) =>
        n instanceof Element && n.classList.contains('sr-only') ? acc : acc + (n.textContent ?? ''),
      '',
    )
    expect(visibleTriggerText).not.toContain('Card')
  })

  it('dropdown menu items show the full visible label', () => {
    render(
      <ViewModeDropdown
        value='card'
        onValueChange={vi.fn<(value: 'card' | 'compact') => void>()}
        options={[
          { label: 'Card', value: 'card', icon: 'card', dataPw: 'post-view-toggle-card' },
          {
            label: 'Compact',
            value: 'compact',
            icon: 'compact',
            dataPw: 'post-view-toggle-compact',
          },
        ]}
      />,
    )

    // Target menu items by exact accessible name.
    // The trigger has aria-label='View: Card' so getByRole({ name: 'Card' }) matches only the menu item.
    expect(screen.getByRole('button', { name: 'Card' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Compact' })).toBeDefined()
  })

  it('calls onValueChange when selecting a view option', () => {
    const onValueChange = vi.fn<(value: 'card' | 'compact') => void>()
    render(
      <ViewModeDropdown
        value='card'
        onValueChange={onValueChange}
        options={[
          { label: 'Card', value: 'card', icon: 'card', dataPw: 'post-view-toggle-card' },
          {
            label: 'Compact',
            value: 'compact',
            icon: 'compact',
            dataPw: 'post-view-toggle-compact',
          },
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'View: Card' }))
    fireEvent.click(screen.getByText('Compact'))

    expect(onValueChange).toHaveBeenCalledWith('compact')
  })
})
