import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock(import('@/components/users/user-posts-page'), () => ({
  UserPostsPage: vi.fn<VitestLooseMock>(({ idOrUsername }: { idOrUsername: string }) => (
    <div data-testid='user-posts-page'>{idOrUsername}</div>
  )),
}))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))

import UserPostsAllRoute, { dynamic } from './page'

describe('UserPostsAllRoute', () => {
  it('exports force-dynamic', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('renders UserPostsPage with idOrUsername from params', async () => {
    const result = await UserPostsAllRoute({
      params: Promise.resolve({ idOrUsername: 'alice' }),
    })
    render(result)
    expect(screen.getByTestId('user-posts-page')).toHaveTextContent('alice')
  })
})
