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
  PageWithAside: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock(import('../create-topic-client'), () => ({
  default: () => <div data-testid='create-topic-client' />,
}))

import Page from '../page'

describe('CreateTopicRoutePage (server)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAdmin.mockResolvedValue({ id: 'admin', roles: ['administrator'] })
  })

  it('renders the client stub when the user is an admin', async () => {
    render(await Page())
    expect(mockRequireAdmin).toHaveBeenCalledOnce()
    expect(screen.getByTestId('create-topic-client')).toBeInTheDocument()
  })

  it('propagates the requireAdmin redirect for non-admins', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT'))
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT')
  })
})
