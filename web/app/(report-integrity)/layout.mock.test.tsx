import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/require-admin'), () => ({ requireAdmin: mockRequireAdmin }))

import ReportIntegrityAdminLayout from './layout'

describe('ReportIntegrityAdminLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAdmin.mockResolvedValue({ id: 'admin', roles: ['administrator'] })
  })

  it('requires admin and renders children', async () => {
    render(await ReportIntegrityAdminLayout({ children: <span data-testid='child' /> }))

    expect(mockRequireAdmin).toHaveBeenCalled()
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('propagates requireAdmin redirects', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT'))

    await expect(ReportIntegrityAdminLayout({ children: <span /> })).rejects.toThrow(
      'NEXT_REDIRECT',
    )
  })
})
