import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { UserProfileTabs } from '../user-profile-tabs'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        scroll: _scroll,
        ...props
      }: {
        children: ReactNode
        href: string
        prefetch?: boolean
        scroll?: boolean
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

describe('UserProfileTabs', () => {
  it('renders all 6 public tabs', () => {
    mockNav.setPathname('/user/tests')

    render(<UserProfileTabs usernameOrId='tests' />)

    expect(screen.getByRole('menuitem', { name: 'About' })).toBeDefined()
    expect(screen.getByText('Posts')).toBeDefined()
    expect(screen.getByText('Topics')).toBeDefined()
    expect(screen.getByText('Friends')).toBeDefined()
    expect(screen.getByText('Sources')).toBeDefined()
    expect(screen.getByText('Communities')).toBeDefined()
  })

  it('About tab is a link to the user index route', () => {
    mockNav.setPathname('/user/tests')

    render(<UserProfileTabs usernameOrId='tests' />)

    const aboutLink = screen.getByRole('menuitem', { name: 'About' })
    expect(aboutLink.getAttribute('href')).toBe('/user/tests')
  })

  it('Topics tab is a link to /topics/following', () => {
    mockNav.setPathname('/user/tests')

    render(<UserProfileTabs usernameOrId='tests' />)

    const topicsLink = screen.getByRole('menuitem', { name: 'Topics' })
    expect(topicsLink.getAttribute('href')).toBe('/user/tests/topics/following')
  })

  it('Communities tab is a link to /communities/member', () => {
    mockNav.setPathname('/user/tests')

    render(<UserProfileTabs usernameOrId='tests' />)

    const communitiesLink = screen.getByRole('menuitem', { name: 'Communities' })
    expect(communitiesLink.getAttribute('href')).toBe('/user/tests/communities/member')
  })

  it('Menubar has overflow-x-auto and scrollbar-hide classes', () => {
    mockNav.setPathname('/user/tests')

    render(<UserProfileTabs usernameOrId='tests' />)

    const tabList = screen.getByRole('menubar')
    expect(tabList.className).toContain('overflow-x-auto')
    expect(tabList.className).toContain('scrollbar-hide')
  })

  it('Posts tab renders as a dropdown trigger when on the posts route', () => {
    mockNav.setPathname('/user/tests/posts')

    const { container } = render(<UserProfileTabs usernameOrId='tests' />)

    // When on /posts, the Posts tab has dropdown items (hasDropdown=true) and
    // renders as a <button> trigger rather than an <a> link
    const postsEl = container.querySelector('[data-pw="user-profile-tab-posts"]')
    expect(postsEl?.tagName.toLowerCase()).toBe('button')
  })
})
