import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(import('../memberships-admin-client'), () => ({
  default: () => <div data-testid='memberships-admin-client' />,
}))

import MembershipsAdminPage from '../page'

describe('MembershipsAdminPage wrapper', () => {
  it('renders the client boundary', () => {
    render(<MembershipsAdminPage />)
    expect(screen.getByTestId('memberships-admin-client')).toBeInTheDocument()
  })
})
