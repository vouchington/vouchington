import { formatUtcDate } from '@ts-shared/utils/format'
import type { Translator } from '@ts-shared/ui-messages'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AuthSession } from '@/types/my'

export function ActiveSessionRow({
  loading,
  session,
  t,
  uiLocale,
  onSignOut,
  onRevokeMcp,
  revokingGrantId,
}: {
  loading: boolean
  session: AuthSession
  t: Translator
  uiLocale: string
  onSignOut: (session: AuthSession) => void
  onRevokeMcp: (grantId: string) => void
  revokingGrantId: string | null
}) {
  return (
    <li
      className='rounded-md border p-4'
      // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
      data-pw={`active-session-item-${session.id}`}
    >
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div className='min-w-0 space-y-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='font-medium'>
              {session.device_name || t('settings.activeSessions.unknownDevice')}
            </span>
            {session.is_current ? (
              <Badge variant='secondary'>{t('settings.activeSessions.thisDevice')}</Badge>
            ) : null}
          </div>
          <p className='text-xs text-muted-foreground'>
            {t('settings.activeSessions.signedInLastSeen', {
              createdAt: formatUtcDate(session.created_at, uiLocale),
              lastSeenAt: formatUtcDate(session.last_seen_at, uiLocale),
            })}
          </p>
          <p className='text-xs text-muted-foreground'>
            {session.ip_address
              ? t('settings.activeSessions.expiresWithIp', {
                  expiresAt: formatUtcDate(session.expires_at, uiLocale),
                  ipAddress: session.ip_address,
                })
              : t('settings.activeSessions.expires', {
                  expiresAt: formatUtcDate(session.expires_at, uiLocale),
                })}
          </p>
          {session.user_agent ? (
            <p className='break-words text-xs text-muted-foreground'>{session.user_agent}</p>
          ) : null}
          {session.mcp_connections.length > 0 ? (
            <div className='space-y-2 pt-2'>
              <p className='text-sm font-medium'>{t('settings.activeSessions.mcpConnections')}</p>
              <ul className='space-y-2'>
                {session.mcp_connections.map(connection => (
                  <li
                    key={connection.grant_id}
                    className='flex flex-wrap items-center gap-2'
                  >
                    <span className='text-sm'>{connection.client_name}</span>
                    <Badge
                      variant={
                        connection.attestation_status === 'attested' ? 'secondary' : 'outline'
                      }
                    >
                      {connection.attestation_status === 'attested'
                        ? t('settings.activeSessions.attested')
                        : t('settings.activeSessions.unattested')}
                    </Badge>
                    <span className='text-xs text-muted-foreground'>
                      {t('settings.activeSessions.mcpLastConnected', {
                        connectedAt: formatUtcDate(connection.last_minted_at, uiLocale),
                      })}
                    </span>
                    <Button
                      data-pw='active-session-row-revoke-mcp-access'
                      variant='outline'
                      size='sm'
                      loading={revokingGrantId === connection.grant_id}
                      disabled={loading || revokingGrantId !== null}
                      onClick={() => onRevokeMcp(connection.grant_id)}
                    >
                      {t('settings.activeSessions.revokeMcpAccess')}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <Button
          variant={session.is_current ? 'destructive' : 'outline'}
          size='sm'
          onClick={() => onSignOut(session)}
          loading={loading}
          disabled={loading}
          data-pw='active-session-sign-out-button'
        >
          {t('settings.activeSessions.signOut')}
        </Button>
      </div>
    </li>
  )
}
