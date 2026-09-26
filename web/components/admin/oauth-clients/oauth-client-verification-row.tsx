'use client'

import { useState } from 'react'
import { BadgeCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { UserLink } from '@/components/users/user-link'
import { unverifyOAuthClient, verifyOAuthClient } from '@/lib/api/client'
import onError, { onSuccess } from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'
import { formatUtcDate } from '@ts-shared/utils/format'
import type { AdminOAuthClientListItem } from '@/types/oauth-apps'

const CELL_CLASS = 'px-4 py-3 align-top text-sm'

export function OAuthClientVerificationRow({ client }: { client: AdminOAuthClientListItem }) {
  const t = useTranslations()
  const [verifiedAt, setVerifiedAt] = useState(client.verified_at)
  const [busy, setBusy] = useState(false)

  async function toggleVerification() {
    setBusy(true)
    try {
      if (verifiedAt) {
        await unverifyOAuthClient(client.id)
        setVerifiedAt(null)
        onSuccess(
          t('extracted.oauthClients.oauthClientVerificationRow.verificationRemoved_116996a2'),
        )
      } else {
        const { oauth_client } = await verifyOAuthClient(client.id, client.client_name)
        setVerifiedAt(oauth_client.verified_at)
        onSuccess(t('extracted.oauthClients.oauthClientVerificationRow.appVerified_ced56e60'))
      }
    } catch (error) {
      onError(error, {
        fallback: t(
          'extracted.oauthClients.oauthClientVerificationRow.failedToUpdateTheVerification_4330b584',
        ),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr data-pw='admin-oauth-client-row'>
      <td className={CELL_CLASS}>
        <div className='font-medium'>{client.client_name}</div>
        <div className='font-mono text-xs text-muted-foreground'>{client.client_id}</div>
        <div className='text-xs text-muted-foreground'>
          {t('extracted.oauthClients.oauthClientVerificationRow.registeredCreatedat_e720b512', {
            createdAt: formatUtcDate(client.created_at),
          })}
        </div>
      </td>
      <td className={CELL_CLASS}>
        {client.owner ? (
          <UserLink user={client.owner} />
        ) : (
          <span className='text-muted-foreground'>
            {t('extracted.oauthClients.oauthClientVerificationRow.noOwner_4339bb43')}
          </span>
        )}
      </td>
      <td className={`${CELL_CLASS} font-mono text-xs`}>
        {client.redirect_uris.map(uri => (
          <div
            key={uri}
            className='break-all'
          >
            {uri}
          </div>
        ))}
      </td>
      <td className={CELL_CLASS}>
        <div className='flex flex-wrap gap-1'>
          {client.scopes.map(scope => (
            <Badge
              key={scope}
              variant='secondary'
              className='text-xs'
            >
              {scope}
            </Badge>
          ))}
        </div>
      </td>
      <td className={CELL_CLASS}>
        {verifiedAt ? (
          <Badge variant='secondary'>
            <BadgeCheck
              aria-hidden='true'
              className='mr-1 h-3 w-3'
            />
            {t('extracted.oauthClients.oauthClientVerificationRow.verifiedVerifiedat_796ea805', {
              verifiedAt: formatUtcDate(verifiedAt),
            })}
          </Badge>
        ) : (
          <Badge variant='outline'>
            {t('extracted.oauthClients.oauthClientVerificationRow.unverified_33c8e8de')}
          </Badge>
        )}
      </td>
      <td className={CELL_CLASS}>
        <Button
          size='sm'
          variant={verifiedAt ? 'outline' : 'default'}
          loading={busy}
          disabled={busy}
          onClick={toggleVerification}
          data-pw='admin-oauth-client-verification-button'
        >
          {verifiedAt
            ? t('extracted.oauthClients.oauthClientVerificationRow.removeVerification_51956055')
            : t('extracted.oauthClients.oauthClientVerificationRow.verify_eea2745e')}
        </Button>
      </td>
    </tr>
  )
}
