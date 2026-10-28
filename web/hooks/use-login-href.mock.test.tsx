import { renderToString } from 'react-dom/server'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from 'vouchington-tooling/next-navigation-mock'
import { useLoginHref } from './use-login-href'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()

function LoginHrefProbe({ intent }: { intent?: string }) {
  const href = useLoginHref(intent)
  return <a href={href}>Login</a>
}

describe('useLoginHref', () => {
  beforeEach(() => {
    mockNav.reset()
    mockNav.setPathname('/news')
    window.history.replaceState(null, '', '/news?topics=initial')
  })

  it('updates the return query after client-side pushState navigation', async () => {
    render(<LoginHrefProbe intent='vote' />)

    expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute(
      'href',
      '/login?next=%2Fnews%3Ftopics%3Dinitial&intent=vote',
    )

    await act(async () => {
      window.history.pushState(null, '', '/news?topics=updated')
    })

    expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute(
      'href',
      '/login?next=%2Fnews%3Ftopics%3Dupdated&intent=vote',
    )
  })

  it('updates the return query after client-side replaceState navigation', async () => {
    render(<LoginHrefProbe />)

    await act(async () => {
      window.history.replaceState(null, '', '/news?topics=replaced')
    })

    expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute(
      'href',
      '/login?next=%2Fnews%3Ftopics%3Dreplaced',
    )
  })

  it('uses getServerSnapshot during server-side rendering', () => {
    const html = renderToString(<LoginHrefProbe intent='vote' />)
    expect(html).toContain('href="/login?next=%2Fnews&amp;intent=vote"')
  })
})
