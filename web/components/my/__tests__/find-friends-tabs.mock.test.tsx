import type { ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { FindFriendsTabs } from '../find-friends-tabs'

const mockUsePathname = vi.fn<() => string>(() => '/my/friend-recommendations')

vi.mock(import('next/navigation'), () => ({
  usePathname: () => mockUsePathname(),
}))

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        ...props
      }: {
        children: ReactNode
        href: string
        prefetch?: boolean
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('@/components/shared/entity-menubar-nav'), () => ({
  EntityMenubarNav: ({ items }: { items: Array<{ key: string; content: ReactNode }> }) => (
    <nav>
      {items.map(item => (
        <div key={item.key}>{item.content}</div>
      ))}
    </nav>
  ),
}))

function getByDataPw(container: HTMLElement, value: string) {
  const el = container.querySelector(`[data-pw="${value}"]`)
  if (!el) throw new Error(`No element with data-pw="${value}"`)
  return el
}

describe('FindFriendsTabs', () => {
  it('renders Suggestions and Dismissed tabs', () => {
    mockUsePathname.mockReturnValue('/my/friend-recommendations')
    const { container } = render(<FindFriendsTabs />)
    expect(getByDataPw(container, 'find-friends-tab-suggestions')).toBeTruthy()
    expect(getByDataPw(container, 'find-friends-tab-dismissed')).toBeTruthy()
  })

  it('marks Suggestions as active on suggestions route', () => {
    mockUsePathname.mockReturnValue('/my/friend-recommendations')
    const { container } = render(<FindFriendsTabs />)
    expect(
      getByDataPw(container, 'find-friends-tab-suggestions').getAttribute('aria-current'),
    ).toBe('page')
    expect(
      getByDataPw(container, 'find-friends-tab-dismissed').getAttribute('aria-current'),
    ).toBeNull()
  })

  it('marks Dismissed as active on dismissed route', () => {
    mockUsePathname.mockReturnValue('/my/friend-recommendations/dismissed')
    const { container } = render(<FindFriendsTabs />)
    expect(getByDataPw(container, 'find-friends-tab-dismissed').getAttribute('aria-current')).toBe(
      'page',
    )
    expect(
      getByDataPw(container, 'find-friends-tab-suggestions').getAttribute('aria-current'),
    ).toBeNull()
  })
})
