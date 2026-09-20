'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { decideOAuthAuthorizationRequest } from '@/lib/api/client/oauth-authorization'
import onError from '@/lib/on-error'

export function ConsentActions({ requestId }: { requestId: string }) {
  const [pendingDecision, setPendingDecision] = useState<'approve' | 'deny' | null>(null)

  async function decide(decision: 'approve' | 'deny') {
    if (pendingDecision) return
    setPendingDecision(decision)
    try {
      const result = await decideOAuthAuthorizationRequest(requestId, decision)
      window.location.assign(result.redirect_uri)
    } catch (error) {
      setPendingDecision(null)
      onError(error, {
        fallback: 'Could not complete this authorization request.',
        tags: { form: 'oauth-consent' },
      })
    }
  }

  return (
    <ButtonGroup>
      <Button
        type='button'
        variant='outline'
        size='touch'
        disabled={pendingDecision !== null}
        loading={pendingDecision === 'approve'}
        data-pw='oauth-consent-approve'
        onClick={async () => decide('approve')}
      >
        Allow access
      </Button>
      <Button
        type='button'
        variant='outline'
        size='touch'
        disabled={pendingDecision !== null}
        loading={pendingDecision === 'deny'}
        data-pw='oauth-consent-deny'
        onClick={async () => decide('deny')}
      >
        Deny
      </Button>
    </ButtonGroup>
  )
}
