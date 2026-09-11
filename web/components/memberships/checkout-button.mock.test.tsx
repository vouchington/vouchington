import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const { mockCreatePurchaseIntent, mockLocationAssign } = vi.hoisted(() => ({
  mockCreatePurchaseIntent: vi.fn<VitestLooseMock>(),
  mockLocationAssign: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client'), () => ({
  createMembershipPurchaseIntent: mockCreatePurchaseIntent,
}))

import { CheckoutButton } from './checkout-button'

async function clickButton() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button'))
  })
}

describe('CheckoutButton https guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign: mockLocationAssign },
      writable: true,
    })
  })

  it('redirects to https Stripe URL', async () => {
    mockCreatePurchaseIntent.mockResolvedValue({
      purchase_intent: {
        launch: {
          kind: 'stripe_checkout',
          checkout_url: 'https://checkout.stripe.com/pay/cs_test_abc',
        },
      },
    })
    const { container } = render(
      <CheckoutButton
        planSlug='pro'
        productId='01990f85-3491-7000-8000-000000000001'
        planName='Pro'
      />,
    )
    expect(container.querySelector('[data-pw="subscribe-to-pro-button"]')).not.toBeNull()
    await clickButton()
    await waitFor(() => {
      expect(mockLocationAssign).toHaveBeenCalledWith('https://checkout.stripe.com/pay/cs_test_abc')
    })
    expect(screen.queryByText(/not secure/i)).toBeNull()
  })

  it('blocks redirect and shows error for http URL', async () => {
    mockCreatePurchaseIntent.mockResolvedValue({
      purchase_intent: {
        launch: {
          kind: 'stripe_checkout',
          checkout_url: 'http://checkout.stripe.com/pay/cs_test_abc',
        },
      },
    })
    render(
      <CheckoutButton
        planSlug='pro'
        productId='01990f85-3491-7000-8000-000000000001'
        planName='Pro'
      />,
    )
    await clickButton()
    await waitFor(() => {
      expect(screen.getByText(/not secure/i)).toBeDefined()
    })
    expect(mockLocationAssign).not.toHaveBeenCalled()
  })

  it('blocks redirect and shows error for non-https URL schemes', async () => {
    mockCreatePurchaseIntent.mockResolvedValue({
      purchase_intent: {
        launch: { kind: 'stripe_checkout', checkout_url: 'ftp://checkout.example.com/pay' },
      },
    })
    render(
      <CheckoutButton
        planSlug='pro'
        productId='01990f85-3491-7000-8000-000000000001'
        planName='Pro'
      />,
    )
    await clickButton()
    await waitFor(() => {
      expect(screen.getByText(/not secure/i)).toBeDefined()
    })
    expect(mockLocationAssign).not.toHaveBeenCalled()
  })

  it('shows error when the launch payload is not Stripe Checkout', async () => {
    mockCreatePurchaseIntent.mockResolvedValue({
      purchase_intent: {
        launch: { kind: 'microsoft_store', product_id: 'product', sku_id: null },
      },
    })
    render(
      <CheckoutButton
        planSlug='pro'
        productId='01990f85-3491-7000-8000-000000000001'
        planName='Pro'
      />,
    )
    await clickButton()
    await waitFor(() => {
      expect(screen.getByText(/failed to create/i)).toBeDefined()
    })
    expect(mockLocationAssign).not.toHaveBeenCalled()
  })
})
