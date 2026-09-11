import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/require-admin'), () => ({ requireAdmin: mockRequireAdmin }))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: ReactNode }) => (
    <div data-testid='page-with-aside'>{children}</div>
  ),
}))

import Layout from '../layout'

describe('CrawlerLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAdmin.mockResolvedValue({ id: 'admin', roles: ['administrator'] })
  })

  it('renders children inside PageWithAside when the user is an admin', async () => {
    render(await Layout({ children: <span data-testid='child' /> }))
    expect(mockRequireAdmin).toHaveBeenCalledOnce()
    expect(screen.getByTestId('page-with-aside')).toBeInTheDocument()
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('propagates the requireAdmin redirect for non-admins', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT'))
    await expect(Layout({ children: <span /> })).rejects.toThrow('NEXT_REDIRECT')
  })
})
