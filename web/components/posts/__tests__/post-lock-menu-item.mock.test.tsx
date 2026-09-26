import { describe, it, expect, vi, beforeEach } from 'vitest'
import { configure, render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'

configure({ testIdAttribute: 'data-pw' })

const mockHandleToggle = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)

vi.mock(import('../use-post-lock-toggle'), () => ({
  usePostLockToggle: ({
    lockedAt,
  }: {
    postIdOrSlug: string
    lockedAt: string | null | undefined
  }) => ({
    isLocked: lockedAt != null,
    isPending: false,
    label: lockedAt != null ? 'Unlock' : 'Lock',
    tooltip: lockedAt != null ? 'Allow new replies' : 'Prevent new replies',
    handleToggle: mockHandleToggle,
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

import { PostLockMenuItem } from '../post-lock-menu-item'

describe('PostLockMenuItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders "Lock" label when post is not locked', () => {
    render(
      <PostLockMenuItem
        postIdOrSlug='post-1'
        lockedAt={null}
      />,
    )
    expect(screen.getByRole('menuitem', { name: 'Lock' })).toBeDefined()
  })

  it('renders "Unlock" label when post is locked', () => {
    render(
      <PostLockMenuItem
        postIdOrSlug='post-1'
        lockedAt='2024-01-01T00:00:00Z'
      />,
    )
    expect(screen.getByRole('menuitem', { name: 'Unlock' })).toBeDefined()
  })

  it('clicking calls handleToggle', () => {
    render(
      <PostLockMenuItem
        postIdOrSlug='post-1'
        lockedAt={null}
      />,
    )
    fireEvent.click(screen.getByRole('menuitem'))
    expect(mockHandleToggle).toHaveBeenCalledOnce()
  })

  it('has data-pw=post-detail-lock-button', () => {
    render(
      <PostLockMenuItem
        postIdOrSlug='post-1'
        lockedAt={null}
      />,
    )
    expect(screen.getByTestId('post-detail-lock-button')).toBeDefined()
  })
})
