/* oxlint-disable no-mistakes/playwright-literals, no-mistakes/playwright-defaults -- Checkout button ID derives from the plan slug prop; ast-grep still bans inline calls in data-pw. */
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createMembershipPurchaseIntent } from '@/lib/api/client'

interface CheckoutButtonProps {
  planSlug: string
  productId: string
  planName: string
}

export function CheckoutButton({ planSlug, productId, planName }: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const buttonTestId = `subscribe-to-${planSlug}-button`

  async function startCheckout() {
    setLoading(true)
    setError(null)
    try {
      const { purchase_intent } = await createMembershipPurchaseIntent(
        'stripe',
        productId,
        crypto.randomUUID(),
      )
      if (purchase_intent.launch.kind !== 'stripe_checkout') {
        setError('Failed to create checkout session. Please try again.')
        return
      }
      const checkoutUrl = purchase_intent.launch.checkout_url
      if (new URL(checkoutUrl).protocol !== 'https:') {
        setError('Checkout redirect URL is not secure. Please try again.')
        return
      }
      window.location.assign(checkoutUrl)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Button
        className='w-full'
        loading={loading}
        disabled={loading}
        onClick={startCheckout}
        data-pw={buttonTestId}
      >
        {loading ? 'Loading...' : `Subscribe to ${planName}`}
      </Button>
      {error && <p className='mt-2 text-sm text-destructive'>{error}</p>}
    </div>
  )
}
