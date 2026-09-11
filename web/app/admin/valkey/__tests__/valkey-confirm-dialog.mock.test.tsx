import type { ReactNode } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock(
  import('@/components/ui/alert-dialog'),
  () =>
    ({
      AlertDialog: ({
        open,
        onOpenChange,
        children,
      }: {
        open: boolean
        onOpenChange?: (open: boolean) => void
        children: ReactNode
      }) =>
        open ? (
          <div data-pw='valkey-confirm-dialog'>
            <button
              type='button'
              onClick={() => onOpenChange?.(false)}
            >
              dismiss
            </button>
            {children}
          </div>
        ) : null,
      AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      AlertDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
      AlertDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
      AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      AlertDialogCancel: ({ children }: { children: ReactNode }) => (
        <button type='button'>{children}</button>
      ),
      AlertDialogAction: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
        <button
          type='button'
          onClick={onClick}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/alert-dialog'),
)

import { ValkeyConfirmDialog } from '../valkey-confirm-dialog'
import type { PendingValkeyAction } from '../valkey-state'

describe('ValkeyConfirmDialog', () => {
  it('renders nothing when there is no pending action', () => {
    render(
      <ValkeyConfirmDialog
        confirmAction={vi.fn<() => void>()}
        pendingAction={null}
        setPendingAction={vi.fn<(action: PendingValkeyAction | null) => void>()}
      />,
    )

    expect(screen.queryByTestId('valkey-confirm-dialog')).toBeNull()
  })

  it('shows rebuild title and description for a rebuild action', () => {
    render(
      <ValkeyConfirmDialog
        confirmAction={vi.fn<() => void>()}
        pendingAction={{ type: 'rebuild', target: 'embedding' }}
        setPendingAction={vi.fn<(action: PendingValkeyAction | null) => void>()}
      />,
    )

    expect(screen.getByText('Rebuild embedding?')).toBeDefined()
    expect(
      screen.getByText(
        'This will enqueue a job to rebuild the embedding bloom filter. Existing filter data will be replaced.',
      ),
    ).toBeDefined()
  })

  it('shows clear title and description for a clear action', () => {
    render(
      <ValkeyConfirmDialog
        confirmAction={vi.fn<() => void>()}
        pendingAction={{ type: 'clear', target: 'posts' }}
        setPendingAction={vi.fn<(action: PendingValkeyAction | null) => void>()}
      />,
    )

    expect(screen.getByText('Clear posts cache?')).toBeDefined()
    expect(
      screen.getByText(
        'This will delete all cached entries for the posts group. They will be repopulated on next access.',
      ),
    ).toBeDefined()
  })

  it('shows flush title and description for a flush action', () => {
    render(
      <ValkeyConfirmDialog
        confirmAction={vi.fn<() => void>()}
        pendingAction={{ type: 'flush', concern: 'blooms' }}
        setPendingAction={vi.fn<(action: PendingValkeyAction | null) => void>()}
      />,
    )

    expect(screen.getByText('Flush blooms?')).toBeDefined()
    expect(
      screen.getByText('Clears all bloom filter keys. Filters will need to be rebuilt.'),
    ).toBeDefined()
  })

  it('shows clear-all title and description for a clearAll action', () => {
    render(
      <ValkeyConfirmDialog
        confirmAction={vi.fn<() => void>()}
        pendingAction={{ type: 'clearAll' }}
        setPendingAction={vi.fn<(action: PendingValkeyAction | null) => void>()}
      />,
    )

    expect(screen.getByText('Clear all caches?')).toBeDefined()
    expect(
      screen.getByText(
        'This will delete all cached entities across all cache groups. They will be repopulated on next access.',
      ),
    ).toBeDefined()
  })

  it('clicking confirm calls confirmAction', () => {
    const confirmAction = vi.fn<() => void>()
    render(
      <ValkeyConfirmDialog
        confirmAction={confirmAction}
        pendingAction={{ type: 'flush', concern: 'caches' }}
        setPendingAction={vi.fn<(action: PendingValkeyAction | null) => void>()}
      />,
    )

    fireEvent.click(screen.getByText('Confirm'))

    expect(confirmAction).toHaveBeenCalledOnce()
  })

  it('dismissing the dialog clears the pending action', () => {
    const setPendingAction = vi.fn<(action: PendingValkeyAction | null) => void>()
    render(
      <ValkeyConfirmDialog
        confirmAction={vi.fn<() => void>()}
        pendingAction={{ type: 'clearAll' }}
        setPendingAction={setPendingAction}
      />,
    )

    fireEvent.click(screen.getByText('dismiss'))

    expect(setPendingAction).toHaveBeenCalledWith(null)
  })
})
