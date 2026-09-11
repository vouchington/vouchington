import { afterEach, describe, expect, it, vi } from 'vitest'
import { requireAdmin } from '@/lib/auth/require-admin'
import Layout from './layout'

vi.mock(import('@/lib/auth/require-admin'), () => ({
  requireAdmin: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))

const mockRequireAdmin = vi.mocked(requireAdmin)

describe('queues layout', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('calls requireAdmin and renders children', async () => {
    mockRequireAdmin.mockResolvedValue({ id: 'u1', roles: ['administrator'] } as any)
    const result = await Layout({ children: <span>child</span> })
    expect(mockRequireAdmin).toHaveBeenCalled()
    expect(result).toBeTruthy()
  })
})
