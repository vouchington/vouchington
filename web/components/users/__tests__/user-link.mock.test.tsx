import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { UserLink } from '../user-link'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: ReactNode
        href: string
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

describe('UserLink', () => {
  it('links to user root', () => {
    const { container } = render(<UserLink user={{ id: 'u1', username: 'alice' }} />)
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/user/alice')
  })

  it('appends reviews tab', () => {
    const { container } = render(
      <UserLink
        user={{ id: 'u1', username: 'alice' }}
        tab='reviews'
      />,
    )
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/user/alice/reviews')
  })

  it('appends discussions tab', () => {
    const { container } = render(
      <UserLink
        user={{ id: 'u1', username: 'alice' }}
        tab='discussions'
      />,
    )
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/user/alice/discussions')
  })

  it('falls back to id when username is null', () => {
    const { container } = render(<UserLink user={{ id: 'u1', username: null }} />)
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/user/u1')
  })

  it('renders @username as default child', () => {
    const { getByText } = render(<UserLink user={{ id: 'u1', username: 'alice' }} />)
    expect(getByText('@alice')).toBeTruthy()
  })

  it('renders id as default child when no username', () => {
    const { getByText } = render(<UserLink user={{ id: 'u1', username: null }} />)
    expect(getByText('u1')).toBeTruthy()
  })

  it('renders custom children', () => {
    const { getByText } = render(
      <UserLink user={{ id: 'u1', username: 'alice' }}>Alice Smith</UserLink>,
    )
    expect(getByText('Alice Smith')).toBeTruthy()
  })

  it('has data-pw user-link', () => {
    const { container } = render(<UserLink user={{ id: 'u1', username: 'alice' }} />)
    expect(container.querySelector('a')?.getAttribute('data-pw')).toBe('user-link')
  })
})
