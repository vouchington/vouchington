import { renderToString } from 'react-dom/server'
import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLoginHref } from './use-login-href'

const mockPathname = vi.hoisted(() => vi.fn<VitestLooseMock>(() => '/news'))
vi.mock(import('next/navigation'), () => ({
  usePathname: mockPathname,
}))

function LoginHrefProbe({ intent }: { intent?: string }) {
  const href = useLoginHref(intent)
  return <a href={href}>Login</a>
}

describe('useLoginHref', () => {
  beforeEach(() => {
    mockPathname.mockReturnValue('/news')
    window.history.replaceState(null, '', '/news?topics=initial')
  })

  it('updates the return query after client-side pushState navigation', async () => {
    render(<LoginHrefProbe intent='vote' />)

    expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute(
      'href',
      '/login?next=%2Fnews%3Ftopics%3Dinitial&intent=vote',
    )

    act(() => {
      window.history.pushState(null, '', '/news?topics=updated')
    })

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute(
        'href',
        '/login?next=%2Fnews%3Ftopics%3Dupdated&intent=vote',
      )
    })
  })

  it('updates the return query after client-side replaceState navigation', async () => {
    render(<LoginHrefProbe />)

    act(() => {
      window.history.replaceState(null, '', '/news?topics=replaced')
    })

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute(
        'href',
        '/login?next=%2Fnews%3Ftopics%3Dreplaced',
      )
    })
  })

  it('uses getServerSnapshot during server-side rendering', () => {
    const html = renderToString(<LoginHrefProbe intent='vote' />)
    expect(html).toContain('href="/login?next=%2Fnews&amp;intent=vote"')
  })
})
