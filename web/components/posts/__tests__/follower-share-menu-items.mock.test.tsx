import type { ReactNode } from 'react'
import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FollowerShareMenuItems } from '../follower-share-menu-items'

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    Send: () => <svg data-testid='send-icon' />,
    Share2: () => <svg data-testid='share-2-icon' />,
  }),
)

vi.mock(
  import('@/components/ui/dropdown-menu'),
  () =>
    ({
      DropdownMenuItem: ({ children }: { children: ReactNode }) => (
        <button type='button'>{children}</button>
      ),
    }) as unknown as typeof import('@/components/ui/dropdown-menu'),
)

describe('FollowerShareMenuItems', () => {
  it('uses canonical share and send icons', () => {
    render(
      <FollowerShareMenuItems
        isSharePending={false}
        onSendOpen={vi.fn<() => void>()}
        onShare={vi.fn<() => Promise<void>>().mockResolvedValue(undefined)}
      />,
    )

    expect(screen.getByRole('button', { name: 'Share with followers' })).toContainElement(
      screen.getByTestId('share-2-icon'),
    )
    expect(screen.getByRole('button', { name: 'Send to followers' })).toContainElement(
      screen.getByTestId('send-icon'),
    )
  })
})
