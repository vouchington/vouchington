import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { configure, render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'

configure({ testIdAttribute: 'data-pw' })

const mockHandleDelete = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)

vi.mock(import('../use-delete-post'), () => ({
  useDeletePost: () => ({
    isDeleting: false,
    handleDelete: mockHandleDelete,
  }),
}))

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    Trash2: () => <svg data-pw='trash-icon' />,
  }),
)

vi.mock(
  import('@/components/ui/dropdown-menu'),
  () =>
    ({
      DropdownMenuItem: ({
        children,
        onSelect,
        disabled,
        className,
      }: {
        children: ReactNode
        onSelect?: (e: Event) => void
        disabled?: boolean
        className?: string
      }) => (
        <button
          type='button'
          role='menuitem'
          disabled={disabled}
          className={className}
          onClick={() => onSelect?.(new Event('select'))}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/dropdown-menu'),
)

vi.mock(
  import('@/components/ui/alert-dialog'),
  () =>
    ({
      AlertDialog: ({
        open,
        children,
      }: {
        open: boolean
        onOpenChange?: unknown
        children: ReactNode
      }) => (open ? <div data-pw='delete-alert-dialog'>{children}</div> : null),
      AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      AlertDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
      AlertDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
      AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      AlertDialogCancel: ({ children, disabled }: { children: ReactNode; disabled?: boolean }) => (
        <button
          type='button'
          disabled={disabled}
        >
          {children}
        </button>
      ),
      AlertDialogAction: ({
        children,
        onClick,
        disabled,
        ...rest
      }: {
        children: ReactNode
        onClick?: () => void
        disabled?: boolean
        [k: string]: unknown
      }) => (
        <button
          type='button'
          onClick={onClick}
          disabled={disabled}
          {...rest}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/alert-dialog'),
)

import { DeletePostMenuItem } from '../delete-post-menu-item'

describe('DeletePostMenuItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a delete menu item with trash icon', () => {
    render(<DeletePostMenuItem postIdOrSlug='post-1' />)
    expect(screen.getByRole('menuitem')).toBeDefined()
    expect(screen.getByTestId('trash-icon')).toBeDefined()
  })

  it('dialog is initially closed', () => {
    render(<DeletePostMenuItem postIdOrSlug='post-1' />)
    expect(screen.queryByTestId('delete-alert-dialog')).toBeNull()
  })

  it('clicking the menu item opens the confirm dialog', () => {
    render(<DeletePostMenuItem postIdOrSlug='post-1' />)
    fireEvent.click(screen.getByRole('menuitem'))
    expect(screen.getByTestId('delete-alert-dialog')).toBeDefined()
  })

  it('confirm button is rendered inside the dialog with data-pw', () => {
    render(<DeletePostMenuItem postIdOrSlug='post-1' />)
    fireEvent.click(screen.getByRole('menuitem'))
    const confirmButton = screen.getByTestId('post-delete-confirm')
    expect(confirmButton).toBeDefined()
    expect(confirmButton).toHaveClass(
      'bg-destructive',
      'text-destructive-foreground',
      'shadow-sm',
      'hover:bg-destructive/90',
    )
  })

  it('clicking confirm calls handleDelete', () => {
    render(<DeletePostMenuItem postIdOrSlug='post-1' />)
    fireEvent.click(screen.getByRole('menuitem'))
    fireEvent.click(screen.getByTestId('post-delete-confirm'))
    expect(mockHandleDelete).toHaveBeenCalledOnce()
  })
})
