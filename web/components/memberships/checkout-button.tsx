/* oxlint-disable no-mistakes/playwright-literals -- Checkout button ID interpolates the plan slug; one substitution is the ast-grep limit, so it cannot be a single literal. */
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createMembershipPurchaseIntent } from '@/lib/api/client'

interface CheckoutButtonProps {
  planSlug: string
  productId: string
  planName: string
  onCheckout?: (checkoutUrl: string) => void
}

export function CheckoutButton({ planSlug, productId, planName, onCheckout }: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      if (onCheckout) {
        onCheckout(checkoutUrl)
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
        data-pw={`subscribe-to-${planSlug}-button`}
      >
        {loading ? 'Loading...' : `Subscribe to ${planName}`}
      </Button>
      {error && <p className='mt-2 text-sm text-destructive'>{error}</p>}
    </div>
  )
}
