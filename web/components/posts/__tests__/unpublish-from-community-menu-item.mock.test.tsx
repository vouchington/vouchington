import { describe, it, expect, vi, beforeEach } from 'vitest'
import { configure, render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'

configure({ testIdAttribute: 'data-pw' })

const mockHandleUnpublish = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)

vi.mock(import('../use-unpublish-from-community'), () => ({
  useUnpublishFromCommunity: () => ({
    isUnpublishing: false,
    handleUnpublish: mockHandleUnpublish,
  }),
}))

vi.mock(
  import('@/components/ui/dropdown-menu'),
  () =>
    ({
      DropdownMenuItem: ({
        children,
        onSelect,
        disabled,
        ...rest
      }: {
        children: ReactNode
        onSelect?: (e: Event) => void
        disabled?: boolean
        [k: string]: unknown
      }) => (
        <button
          type='button'
          role='menuitem'
          disabled={disabled}
          onClick={() => onSelect?.(new Event('select'))}
          {...rest}
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
      }) => (open ? <div data-pw='unpublish-alert-dialog'>{children}</div> : null),
      AlertDialogContent: ({
        children,
        ...rest
      }: {
        children: ReactNode
        [k: string]: unknown
      }) => <div {...rest}>{children}</div>,
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

import { UnpublishFromCommunityMenuItem } from '../unpublish-from-community-menu-item'

describe('UnpublishFromCommunityMenuItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders an "Unpublish" menu item', () => {
    render(
      <UnpublishFromCommunityMenuItem
        communityId='community-1'
        postId='post-1'
      />,
    )
    expect(screen.getByRole('menuitem', { name: 'Unpublish' })).toBeDefined()
    expect(screen.getByTestId('post-unpublish-from-community-trigger')).toBeDefined()
  })

  it('dialog is initially closed', () => {
    render(
      <UnpublishFromCommunityMenuItem
        communityId='community-1'
        postId='post-1'
      />,
    )
    expect(screen.queryByTestId('unpublish-alert-dialog')).toBeNull()
  })

  it('clicking the menu item opens the confirm dialog', () => {
    render(
      <UnpublishFromCommunityMenuItem
        communityId='community-1'
        postId='post-1'
      />,
    )
    fireEvent.click(screen.getByRole('menuitem'))
    expect(screen.getByTestId('unpublish-alert-dialog')).toBeDefined()
  })

  it('dialog has the correct data-pw attribute', () => {
    render(
      <UnpublishFromCommunityMenuItem
        communityId='community-1'
        postId='post-1'
      />,
    )
    fireEvent.click(screen.getByRole('menuitem'))
    expect(screen.getByTestId('post-unpublish-from-community-dialog')).toBeDefined()
  })

  it('clicking confirm calls handleUnpublish', () => {
    render(
      <UnpublishFromCommunityMenuItem
        communityId='community-1'
        postId='post-1'
      />,
    )
    fireEvent.click(screen.getByRole('menuitem'))
    fireEvent.click(screen.getByTestId('post-unpublish-from-community-confirm'))
    expect(mockHandleUnpublish).toHaveBeenCalledOnce()
  })

  it('shows Unpublished after the request succeeds', async () => {
    mockHandleUnpublish.mockResolvedValueOnce(true)
    render(
      <UnpublishFromCommunityMenuItem
        communityId='community-1'
        postId='post-1'
      />,
    )
    fireEvent.click(screen.getByRole('menuitem'))
    fireEvent.click(screen.getByTestId('post-unpublish-from-community-confirm'))
    expect(await screen.findByRole('menuitem', { name: 'Unpublished' })).toBeDefined()
  })
})
