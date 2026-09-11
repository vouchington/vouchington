import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const { mockCreateBillingPortalSession, mockLocationAssign } = vi.hoisted(() => ({
  mockCreateBillingPortalSession: vi.fn<VitestLooseMock>(),
  mockLocationAssign: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client'), () => ({
  createBillingPortalSession: mockCreateBillingPortalSession,
}))

import { BillingPortalButton } from './billing-portal-button'

async function clickButton() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button'))
  })
}

describe('BillingPortalButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign: mockLocationAssign },
      writable: true,
    })
  })

  it('redirects to the billing portal URL', async () => {
    mockCreateBillingPortalSession.mockResolvedValue({
      portal_session: { url: 'https://billing.stripe.com/session/test_123' },
    })
    render(<BillingPortalButton />)
    await clickButton()
    await waitFor(() => {
      expect(mockLocationAssign).toHaveBeenCalledWith('https://billing.stripe.com/session/test_123')
    })
    expect(screen.queryByText(/failed to open/i)).toBeNull()
  })

  it('shows an error when the billing portal URL is missing', async () => {
    mockCreateBillingPortalSession.mockResolvedValue({
      portal_session: { url: null },
    })
    render(<BillingPortalButton />)
    await clickButton()
    await waitFor(() => {
      expect(screen.getByText(/failed to open/i)).toBeDefined()
    })
    expect(mockLocationAssign).not.toHaveBeenCalled()
  })

  it('blocks redirect and shows an error for non-https URLs', async () => {
    mockCreateBillingPortalSession.mockResolvedValue({
      portal_session: { url: 'http://billing.stripe.com/session/test_123' },
    })
    render(<BillingPortalButton />)
    await clickButton()
    await waitFor(() => {
      expect(screen.getByText(/not secure/i)).toBeDefined()
    })
    expect(mockLocationAssign).not.toHaveBeenCalled()
  })
})
