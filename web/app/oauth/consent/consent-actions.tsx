'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { decideOAuthAuthorizationRequest } from '@/lib/api/client/oauth-authorization'
import { useTranslations } from '@/lib/i18n/use-translations'
import onError from '@/lib/on-error'

export function ConsentActions({ requestId }: { requestId: string }) {
  const t = useTranslations()
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
        fallback: t('shared.oauth.consent.authorizationError'),
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
        {t('shared.oauth.consent.allow')}
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
        {t('shared.oauth.consent.deny')}
      </Button>
    </ButtonGroup>
  )
}
