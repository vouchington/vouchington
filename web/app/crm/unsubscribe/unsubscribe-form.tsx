'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { unsubscribeCrmContactToken } from '@/lib/api/client/crm'
import onError, { onSuccess } from '@/lib/on-error'

export function CrmUnsubscribeForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function submit() {
    if (!token || loading || done) return
    setLoading(true)
    try {
      await unsubscribeCrmContactToken(token)
      setDone(true)
      onSuccess('Unsubscribed')
    } catch (error) {
      onError(error, {
        fallback: 'Failed to unsubscribe',
        tags: { form: 'public-crm-unsubscribe' },
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='space-y-4'>
      {!token && (
        <p
          className='text-destructive text-sm'
          role='alert'
        >
          Invalid or missing unsubscribe token. Check the link in your email.
        </p>
      )}
      <Button
        type='button'
        disabled={!token || loading || done}
        data-pw='public-crm-unsubscribe-button'
        onClick={() => {
          void submit()
        }}
      >
        {done ? 'Unsubscribed' : loading ? 'Unsubscribing' : 'Unsubscribe'}
      </Button>
    </div>
  )
}
