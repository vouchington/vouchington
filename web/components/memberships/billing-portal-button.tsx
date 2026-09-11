'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createBillingPortalSession } from '@/lib/api/client'

export function BillingPortalButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function openBillingPortal() {
    setLoading(true)
    setError(null)
    try {
      const { portal_session } = await createBillingPortalSession('/plans')
      if (!portal_session?.url) {
        setError('Failed to open billing portal. Please try again.')
        return
      }
      if (new URL(portal_session.url).protocol !== 'https:') {
        setError('Billing portal redirect URL is not secure. Please try again.')
        return
      }
      window.location.assign(portal_session.url)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='w-full'>
      <Button
        variant='outline'
        className='w-full'
        loading={loading}
        disabled={loading}
        onClick={openBillingPortal}
      >
        {loading ? 'Loading...' : 'Manage Billing'}
      </Button>
      {error && <p className='mt-2 text-sm text-destructive'>{error}</p>}
    </div>
  )
}
