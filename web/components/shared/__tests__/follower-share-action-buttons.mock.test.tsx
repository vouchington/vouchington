import type { ReactNode } from 'react'
import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FollowerShareActionButtons } from '../follower-share-action-buttons'

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    MoreHorizontal: () => <svg data-testid='more-horizontal-icon' />,
    Send: () => <svg data-testid='send-icon' />,
    Share2: () => <svg data-testid='share-2-icon' />,
  }),
)

vi.mock(
  import('@/components/ui/dropdown-menu'),
  () =>
    ({
      DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuItem: ({ children }: { children: ReactNode }) => (
        <button type='button'>{children}</button>
      ),
      DropdownMenuSeparator: () => <hr />,
      DropdownMenuTrigger: ({ children }: { children: ReactNode; asChild?: boolean }) => (
        <div>{children}</div>
      ),
    }) as unknown as typeof import('@/components/ui/dropdown-menu'),
)

describe('FollowerShareActionButtons', () => {
  it('uses the canonical send icon for full buttons', () => {
    render(
      <FollowerShareActionButtons
        compact={false}
        isSharePending={false}
        onSendOpen={vi.fn<() => void>()}
        onShare={vi.fn<() => Promise<void>>().mockResolvedValue(undefined)}
      />,
    )

    expect(screen.getByRole('button', { name: 'Send to followers' })).toContainElement(
      screen.getByTestId('send-icon'),
    )
  })

  it('uses canonical more, share, and send icons for compact actions', () => {
    render(
      <FollowerShareActionButtons
        compact
        isSharePending={false}
        onSendOpen={vi.fn<() => void>()}
        onShare={vi.fn<() => Promise<void>>().mockResolvedValue(undefined)}
      />,
    )

    expect(screen.getByRole('button', { name: 'More actions' })).toContainElement(
      screen.getByTestId('more-horizontal-icon'),
    )
    expect(screen.getByRole('button', { name: 'Share with followers' })).toContainElement(
      screen.getByTestId('share-2-icon'),
    )
    expect(screen.getByRole('button', { name: 'Send to followers' })).toContainElement(
      screen.getByTestId('send-icon'),
    )
  })
})
